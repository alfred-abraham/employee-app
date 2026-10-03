import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test, { before, beforeEach, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { db } from "@/db";
import * as schema from "@/db/schema";
import { claimDocumentCleanup, createDocumentRepository, listDocuments } from "./document-repository";
import { createDocumentService, type DocumentRecord, type DocumentStorage, type DocumentRepository } from "./document-service";
import { defaultDocumentLimits } from "./document-policy";
import { validateDocument } from "./document-validation";

const postgres = new PGlite();
const database = drizzle(postgres, { schema }) as unknown as typeof db;
const repository = createDocumentRepository(database, () => "test-private-documents", () => defaultDocumentLimits);
const bytes = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const input = validateDocument(bytes, "resume.pdf", "application/pdf", "resume", defaultDocumentLimits);
const objects = new Map<string, Buffer>();
let saves = 0;
let deletes = 0;
let failSave = false;
let failDelete = false;
const objectName = (document: DocumentRecord) => `${document.bucket}/${document.objectKey}`;
const storage: DocumentStorage = {
  async save(document, data) {
    saves++;
    if (failSave) throw new Error("bucket unavailable");
    assert.equal(objects.has(objectName(document)), false, "object keys must not overwrite existing bytes");
    objects.set(objectName(document), data);
    return "12345678901234567";
  },
  async delete(document) { deletes++; if (failDelete) throw new Error("bucket deletion failed"); objects.delete(objectName(document)); },
  async download(document) { const data = objects.get(objectName(document)); if (!data) throw new Error("missing object"); return new ReadableStream({ start(controller) { controller.enqueue(data); controller.close(); } }); },
};
const service = createDocumentService(repository, storage);

before(async () => {
  await postgres.exec('CREATE TABLE "user" (id text PRIMARY KEY);');
  await postgres.exec(await readFile(new URL("../../drizzle/0006_profile_documents.sql", import.meta.url), "utf8"));
});
beforeEach(async () => {
  await postgres.exec('TRUNCATE profile_documents, "user" CASCADE; INSERT INTO "user" (id) VALUES (\'alice\'), (\'bob\');');
  objects.clear(); saves = 0; deletes = 0; failSave = false; failDelete = false;
});
after(() => postgres.close());

test("upload persists SQL metadata and bucket bytes; a fresh service can list and download", async () => {
  const uploaded = await service.upload("alice", randomUUID(), input, bytes);
  assert.equal(uploaded.status, "ready");
  assert.equal("objectKey" in uploaded, false);
  assert.equal("userId" in uploaded, false);
  const records = await listDocuments("alice", database);
  assert.equal(records.length, 1);
  assert.equal(records[0].generation, "12345678901234567");
  assert.equal(records[0].byteSize, bytes.length);
  assert.equal(records[0].originalName, "resume.pdf");
  assert.deepEqual(objects.get(objectName(records[0])), bytes);
  const restarted = createDocumentService(createDocumentRepository(database, () => "test-private-documents"), storage);
  const download = await restarted.download("alice", uploaded.id);
  assert.deepEqual(Buffer.from(await new Response(download.stream).arrayBuffer()), bytes);
  assert.equal((await listDocuments("bob", database)).length, 0);
});

test("cross-user download/delete cannot access stored files; missing accounts cannot reserve", async () => {
  const uploaded = await service.upload("alice", randomUUID(), input, bytes);
  await assert.rejects(service.download("bob", uploaded.id), { status: 404 });
  await service.delete("bob", uploaded.id);
  assert.equal(deletes, 0);
  assert.equal((await repository.owned("alice", uploaded.id))?.status, "ready");
  await assert.rejects(service.upload("unknown", randomUUID(), input, bytes), { status: 401 });
  assert.equal(saves, 1);
});

test("idempotency returns the same upload and duplicate filenames use separate objects", async () => {
  const key = randomUUID();
  const first = await service.upload("alice", key, input, bytes);
  assert.equal((await service.upload("alice", key, input, bytes)).id, first.id);
  assert.equal(saves, 1);
  await assert.rejects(service.upload("alice", key, { ...input, category: "other" }, bytes), { status: 409 });
  const second = await service.upload("alice", randomUUID(), input, bytes);
  assert.notEqual(first.id, second.id);
  assert.equal(objects.size, 2);
  const bob = await service.upload("bob", key, input, bytes);
  assert.notEqual(bob.id, first.id);
});

test("quota reservations include incomplete/deleting entries and prevent excess count/bytes", async () => {
  const quotaRepo = createDocumentRepository(database, () => "test-private-documents", () => ({ ...defaultDocumentLimits, maxDocuments: 1 }));
  const quotaService = createDocumentService(quotaRepo, storage);
  const [first, second] = await Promise.allSettled([quotaService.upload("alice", randomUUID(), input, bytes), quotaService.upload("alice", randomUUID(), input, bytes)]);
  assert.equal([first, second].filter((result) => result.status === "fulfilled").length, 1);
  assert.equal((await listDocuments("alice", database)).length, 1);
  const tinyRepo = createDocumentRepository(database, () => "test-private-documents", () => ({ ...defaultDocumentLimits, maxTotalBytes: bytes.length - 1 }));
  await assert.rejects(createDocumentService(tinyRepo, storage).upload("bob", randomUUID(), input, bytes), { status: 409 });
});

test("SQL reservation failure writes no bucket object", async () => {
  const broken: DocumentRepository = { ...repository, async reserve() { throw new Error("SQL unavailable"); } };
  await assert.rejects(createDocumentService(broken, storage).upload("alice", randomUUID(), input, bytes));
  assert.equal(saves, 0);
  assert.equal(objects.size, 0);
});

test("bucket upload failure leaves a tracked cleanup record and no downloadable document", async () => {
  failSave = true;
  await assert.rejects(service.upload("alice", randomUUID(), input, bytes), { status: 503 });
  const [record] = await listDocuments("alice", database);
  assert.equal(record.status, "deleting");
  await assert.rejects(service.download("alice", record.id), { status: 409 });
  assert.equal(objects.size, 0);
});

test("final metadata failure cleans bytes; cleanup failures keep durable references for retry", async () => {
  const broken: DocumentRepository = { ...repository, async ready() { throw new Error("metadata write failed"); }, async deleting() { throw new Error("database still unavailable"); } };
  failDelete = true;
  await assert.rejects(createDocumentService(broken, storage).upload("alice", randomUUID(), input, bytes), { status: 503 });
  const [record] = await listDocuments("alice", database);
  assert.equal(record.status, "pending");
  assert.equal(objects.size, 1);
  await assert.rejects(service.download("alice", record.id), { status: 409 });
  assert.equal((await claimDocumentCleanup(100, database)).length, 0, "fresh uploads must not be swept");
  await postgres.exec("UPDATE profile_documents SET updated_at = now() - interval '2 hours'");
  const cleanup = await claimDocumentCleanup(100, database);
  assert.equal(cleanup.length, 1);
  failDelete = false;
  await storage.delete(cleanup[0]); await repository.remove(cleanup[0].id);
  assert.equal(objects.size, 0);
  assert.equal((await listDocuments("alice", database)).length, 0);
});

test("pending reservations reject concurrent retries and cannot be manually deleted", async () => {
  const key = randomUUID();
  const { document } = await repository.reserve("alice", key, input);
  await assert.rejects(service.upload("alice", key, input, bytes), { status: 409 });
  await assert.rejects(service.delete("alice", document.id), { status: 409 });
  assert.equal(saves, 0);
});

test("a lost final SQL response preserves bytes when ready committed and cleanup cannot be recorded", async () => {
  const key = randomUUID();
  const uncertain: DocumentRepository = {
    ...repository,
    async ready(userId, id, generation) { await repository.ready(userId, id, generation); throw new Error("SQL response lost after commit"); },
    async deleting() { throw new Error("SQL connection unavailable"); },
  };
  await assert.rejects(createDocumentService(uncertain, storage).upload("alice", key, input, bytes), { status: 503 });
  assert.equal(objects.size, 1);
  assert.equal(deletes, 0);
  const recovered = await service.upload("alice", key, input, bytes);
  assert.equal(recovered.status, "ready");
  assert.equal(saves, 1);
  const downloaded = await service.download("alice", recovered.id);
  assert.deepEqual(Buffer.from(await new Response(downloaded.stream).arrayBuffer()), bytes);
});

test("deleting the owner during upload prevents completion and leaves cleanup tracking", async () => {
  const deletingOwner: DocumentStorage = { ...storage, async save(document, data) {
    const generation = await storage.save(document, data);
    await postgres.exec('DELETE FROM "user" WHERE id = \'alice\'');
    return generation;
  } };
  await assert.rejects(createDocumentService(repository, deletingOwner).upload("alice", randomUUID(), input, bytes), { status: 503 });
  assert.equal(objects.size, 0);
  const rows = await postgres.query<{ user_id: string | null; status: string }>("SELECT user_id, status FROM profile_documents");
  assert.equal(rows.rows[0].user_id, null);
  assert.equal(rows.rows[0].status, "deleting");
});

test("deletion handles partial failures and repeated removal safely", async () => {
  const uploaded = await service.upload("alice", randomUUID(), input, bytes);
  failDelete = true;
  await assert.rejects(service.delete("alice", uploaded.id), { status: 503 });
  assert.equal((await repository.owned("alice", uploaded.id))?.status, "deleting");
  await assert.rejects(service.download("alice", uploaded.id), { status: 409 });
  failDelete = false;
  const broken: DocumentRepository = { ...repository, async remove() { throw new Error("metadata deletion failed"); } };
  await assert.rejects(createDocumentService(broken, storage).delete("alice", uploaded.id), { status: 503 });
  assert.equal(objects.size, 0);
  await service.delete("alice", uploaded.id);
  await service.delete("alice", uploaded.id);
  assert.equal(await repository.owned("alice", uploaded.id), null);
});

test("account deletion retains object references; cleanup skips live documents and claims once", async () => {
  const alice = await service.upload("alice", randomUUID(), input, bytes);
  await service.upload("bob", randomUUID(), input, bytes);
  await postgres.exec("UPDATE profile_documents SET updated_at = now() - interval '2 hours'; DELETE FROM \"user\" WHERE id = 'alice'");
  assert.equal(await repository.owned("alice", alice.id), null);
  const cleanup = await claimDocumentCleanup(100, database);
  assert.equal(cleanup.length, 1);
  assert.equal(cleanup[0].id, alice.id);
  assert.equal(cleanup[0].userId, null);
  assert.equal((await claimDocumentCleanup(100, database)).length, 0);
  await storage.delete(cleanup[0]); await repository.remove(cleanup[0].id);
  assert.equal(objects.size, 1);
  assert.equal((await listDocuments("bob", database)).length, 1);
});

// Explicit deployment smoke check. Creates disposable accounts, tests their own documents,
// then removes only those fixtures. Credentials are generated in memory and never printed.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { hashPassword } from "better-auth/crypto";
import { Storage } from "@google-cloud/storage";

async function main() {
  const origin = process.env.DOCUMENT_SMOKE_TEST_ORIGIN;
  if (!origin || !origin.startsWith("https://") || process.env.DOCUMENT_SMOKE_TEST_CONFIRM !== "create-disposable-document-fixtures") throw new Error("Set an HTTPS DOCUMENT_SMOKE_TEST_ORIGIN and explicitly enable disposable fixtures.");
  if (!process.env.DATABASE_URL || !process.env.DOCUMENTS_BUCKET) throw new Error("Database and document bucket configuration are required.");
  const sql = postgres(process.env.DATABASE_URL, { max: 1, ...(process.env.DATABASE_SOCKET_PATH ? { host: process.env.DATABASE_SOCKET_PATH } : {}) });
  const storage = new Storage();
  const accounts = [randomUUID(), randomUUID()].map((id) => ({ id, email: `document-smoke-${id}@example.invalid`, password: `Document9!${randomBytes(24).toString("hex")}` }));
  const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
  const docs: string[] = [];
  async function call(path: string, options: RequestInit = {}, cookie?: string) {
    const headers = new Headers(options.headers);
    headers.set("Origin", origin!);
    if (cookie) headers.set("Cookie", cookie);
    return fetch(`${origin}${path}`, { ...options, headers, signal: AbortSignal.timeout(45_000) });
  }
  async function signIn(account: typeof accounts[number]) {
    const response = await call("/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: account.email, password: account.password }) });
    assert.equal(response.status, 200, "fixture sign-in must succeed");
    const cookie = response.headers.getSetCookie().map((entry) => entry.split(";")[0]).join("; ");
    assert.ok(cookie, "sign-in must issue a session cookie");
    return cookie;
  }
  try {
    for (const account of accounts) {
      const passwordHash = await hashPassword(account.password);
      await sql.begin(async (tx) => {
        await tx`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES (${account.id}, 'Document deployment check', ${account.email}, true, now(), now())`;
        await tx`INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (${randomUUID()}, ${account.id}, 'credential', ${account.id}, ${passwordHash}, now(), now())`;
      });
    }
    const alice = await signIn(accounts[0]);
    const bob = await signIn(accounts[1]);
    assert.equal((await call("/api/me/documents")).status, 401);
    const initial = await call("/api/me/documents", {}, alice);
    assert.equal(initial.status, 200);
    assert.equal((await initial.json()).configured, true);
    const profile = await call("/my-documents", {}, alice);
    assert.equal(profile.status, 200, "a signed-in account can open its document profile");
    assert.match(await profile.text(), /Your profile documents/);
    for (const category of ["resume", "other"]) {
      const key = randomUUID();
      const options = { method: "POST", headers: { "Content-Type": "application/pdf", "X-Document-Name": "deployment-check.pdf", "X-Document-Category": category, "Idempotency-Key": key }, body: pdf };
      const response = await call("/api/me/documents", options, alice);
      assert.equal(response.status, 201, "profile document upload must succeed");
      const document = (await response.json()).document;
      docs.push(document.id);
      assert.equal(document.status, "ready");
      assert.equal(document.category, category);
      assert.equal(document.byteSize, pdf.length);
      const retry = await call("/api/me/documents", options, alice);
      assert.equal(retry.status, 201);
      assert.equal((await retry.json()).document.id, document.id, "a retry must preserve the existing upload");
      const [metadata] = await sql`SELECT * FROM profile_documents WHERE id = ${document.id} AND user_id = ${accounts[0].id}`;
      assert.ok(metadata.generation);
      assert.equal(metadata.bucket, process.env.DOCUMENTS_BUCKET);
      assert.equal(Number(metadata.byte_size), pdf.length);
      const [object] = await storage.bucket(metadata.bucket).file(metadata.object_key, { generation: String(metadata.generation) }).getMetadata();
      assert.equal(Number(object.size), pdf.length);
      const anonymousObject = await fetch(`https://storage.googleapis.com/${metadata.bucket}/${metadata.object_key}`, { signal: AbortSignal.timeout(20_000) });
      assert.ok([401, 403, 404].includes(anonymousObject.status), "bucket contents must not be anonymously accessible");
      assert.equal((await call(`/api/me/documents/${document.id}`, {}, bob)).status, 404);
      assert.equal((await call(`/api/me/documents/${document.id}`, { method: "DELETE" }, bob)).status, 204);
      const download = await call(`/api/me/documents/${document.id}`, {}, alice);
      assert.equal(download.status, 200);
      assert.match(download.headers.get("content-disposition") ?? "", /^attachment;/);
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), pdf, "downloaded bytes must match the upload");
    }
    assert.notEqual(docs[0], docs[1], "duplicate filenames must use distinct objects");
    const freshSession = await signIn(accounts[0]);
    const listing = await call("/api/me/documents", {}, freshSession);
    assert.equal((await listing.json()).documents.length, 2, "documents must persist in a new session");
    for (const id of docs) {
      const [metadata] = await sql`SELECT bucket, object_key, generation FROM profile_documents WHERE id = ${id} AND user_id = ${accounts[0].id}`;
      assert.equal((await call(`/api/me/documents/${id}`, { method: "DELETE" }, freshSession)).status, 204);
      assert.equal((await sql`SELECT id FROM profile_documents WHERE id = ${id}`).length, 0);
      const [exists] = await storage.bucket(metadata.bucket).file(metadata.object_key, { generation: String(metadata.generation) }).exists();
      assert.equal(exists, false, "removal must delete the bucket object as well as SQL metadata");
      assert.equal((await call(`/api/me/documents/${id}`, {}, freshSession)).status, 404);
    }
    console.log("Document deployment verified: uploads, bucket/SQL persistence, retries, private access, cross-user denial, downloads, new-session persistence, and removal.");
  } finally {
    try {
      // Scoped to the UUID account IDs created above, including fixtures left by a failed check.
      const remaining = await sql`SELECT * FROM profile_documents WHERE user_id IN ${sql(accounts.map((account) => account.id))}`;
      for (const document of remaining) {
        await storage.bucket(document.bucket).file(document.object_key, document.generation ? { generation: String(document.generation) } : undefined).delete({ ignoreNotFound: true });
        await sql`DELETE FROM profile_documents WHERE id = ${document.id} AND user_id IN ${sql(accounts.map((account) => account.id))}`;
      }
      for (const account of accounts) await sql`DELETE FROM "user" WHERE id = ${account.id} AND email = ${account.email}`;
    } finally { await sql.end(); }
  }
}
main().catch((error) => { console.error("Document deployment verification failed:", error instanceof Error ? error.message : "unknown error"); process.exitCode = 1; });

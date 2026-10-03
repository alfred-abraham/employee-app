import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { Storage, CRC32C } from "@google-cloud/storage";
import { createDocumentStorage } from "./document-storage";
import type { DocumentRecord } from "./document-service";

test("GCP SDK uploads without overwrite, streams checked downloads, and deletes the exact generation", async () => {
  const bytes = Buffer.from("%PDF-1.7\n%%EOF");
  const checksum = new CRC32C(); checksum.update(bytes);
  const hash = checksum.toString();
  const requests: Array<{ method: string; url: URL }> = [];
  let removed = false;
  const metadata = { bucket: "test-documents", name: "profile-documents/test-id", generation: "1770000000000001", size: String(bytes.length), crc32c: hash, contentType: "application/pdf" };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, "http://localhost");
    requests.push({ method: request.method!, url });
    if (request.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      assert.ok(Buffer.concat(chunks).includes(bytes));
      response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(metadata));
    } else if (request.method === "DELETE") {
      response.statusCode = removed ? 404 : 204; removed = true; response.end();
    } else if (url.searchParams.get("alt") === "media") {
      response.setHeader("Content-Type", "application/pdf");
      response.setHeader("x-goog-hash", `crc32c=${hash}`); response.end(bytes);
    } else { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(metadata)); }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const client = new Storage({ apiEndpoint: `http://127.0.0.1:${address.port}`, projectId: "test-project", retryOptions: { autoRetry: false } });
  const storage = createDocumentStorage(client);
  const document: DocumentRecord = { id: "test-id", userId: "alice", uploadKey: "test-upload", originalName: "resume.pdf", category: "resume", contentType: "application/pdf", byteSize: bytes.length, sha256: "test-hash", bucket: "test-documents", objectKey: "profile-documents/test-id", generation: null, status: "pending", createdAt: new Date(), updatedAt: new Date() };
  try {
    const generation = await storage.save(document, bytes);
    assert.equal(generation, metadata.generation);
    const post = requests.find((request) => request.method === "POST")!;
    assert.equal(post.url.searchParams.get("ifGenerationMatch"), "0");
    const saved = { ...document, generation, status: "ready" as const };
    const stream = await storage.download(saved);
    assert.deepEqual(Buffer.from(await new Response(stream).arrayBuffer()), bytes);
    await storage.delete(saved);
    await storage.delete(saved); // A repeated 404 is an idempotent success.
    const readsAndDeletes = requests.filter((request) => request.method === "DELETE" || request.url.searchParams.get("alt") === "media");
    assert.equal(readsAndDeletes.length, 3);
    for (const request of readsAndDeletes) assert.equal(request.url.searchParams.get("generation"), metadata.generation);
    const requestsBeforeUnsafe = requests.length;
    await assert.rejects(storage.delete({ ...saved, generation: "12345678901234567" }), { status: 503 });
    assert.equal(requests.length, requestsBeforeUnsafe, "an imprecise generation must never reach the bucket");
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});

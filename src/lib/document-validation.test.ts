import assert from "node:assert/strict";
import test from "node:test";
import AdmZip from "adm-zip";
import { defaultDocumentLimits } from "./document-policy";
import { documentDisposition, getDocumentLimits, readDocumentBody, validateDocument, validateDocumentId } from "./document-validation";
import { requireDocumentOrigin, withDocumentUploadSlot } from "./document-api";

const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const validate = (data: Buffer = pdf, name = "resume.pdf", mime = "application/pdf", category = "resume") => validateDocument(data, name, mime, category, defaultDocumentLimits);

test("document allowlist checks content, extension, MIME, filename, category and size", () => {
  assert.equal(validate().byteSize, pdf.length);
  assert.equal(validate(pdf, "résumé.PDF", "application/octet-stream").originalName, "résumé.PDF");
  for (const [data, name, mime, category] of [
    [Buffer.alloc(0), "resume.pdf", "application/pdf", "resume"],
    [Buffer.from("<script>bad</script>"), "resume.pdf", "application/pdf", "resume"],
    [pdf, "resume.exe", "application/pdf", "resume"],
    [pdf, "../resume.pdf", "application/pdf", "resume"],
    [pdf, "evil\r\nname.pdf", "application/pdf", "resume"],
    [pdf, "resume.pdf", "text/html", "resume"],
    [pdf, "resume.pdf", "application/pdf", "admin"],
  ] as const) assert.throws(() => validate(data, name, mime, category));
  assert.throws(() => validateDocument(pdf, "resume.pdf", "application/pdf", "resume", { ...defaultDocumentLimits, maxFileBytes: 2 }));
});

test("DOCX requires Word XML parts and rejects macros, encrypted flags and expansion bombs", () => {
  const archive = new AdmZip();
  archive.addFile("[Content_Types].xml", Buffer.from('<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'));
  archive.addFile("word/document.xml", Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>'));
  const valid = archive.toBuffer();
  assert.equal(validate(valid, "resume.docx", "").contentType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.throws(() => validate(valid, "resume.pdf"));
  const genericZip = new AdmZip(); genericZip.addFile("hello.txt", Buffer.from("hello"));
  assert.throws(() => validate(genericZip.toBuffer(), "resume.docx", ""));
  archive.addFile("word/vbaProject.bin", Buffer.from("macro"));
  assert.throws(() => validate(archive.toBuffer(), "resume.docx", ""));
  archive.deleteFile("word/vbaProject.bin");
  archive.getEntry("word/document.xml")!.header.size = 50 * 1024 * 1024;
  assert.throws(() => validate(archive.toBuffer(), "resume.docx", ""));
});

test("stream reader rejects oversized chunked uploads without relying on Content-Length", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4)); controller.enqueue(new Uint8Array(4)); }, cancel() { cancelled = true; } });
  const request = new Request("http://localhost/api/me/documents", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  await assert.rejects(readDocumentBody(request, 5), { status: 413 });
  assert.equal(cancelled, true);
  assert.deepEqual(await readDocumentBody(new Request("http://localhost", { method: "POST", body: pdf }), pdf.length), pdf);
});

test("download headers encode Unicode safely and IDs/settings are bounded", () => {
  assert.match(documentDisposition("résumé (2026).pdf"), /^attachment; filename="r_sum_ _2026_.pdf"; filename\*=UTF-8''/);
  assert.ok(!documentDisposition("résumé.pdf").includes("\n"));
  assert.equal(validateDocumentId("6C7E1111-2222-4333-8444-555555555555"), "6c7e1111-2222-4333-8444-555555555555");
  assert.throws(() => validateDocumentId("../user"));
  assert.deepEqual(getDocumentLimits({}), defaultDocumentLimits);
  assert.throws(() => getDocumentLimits({ DOCUMENT_MAX_COUNT: "0" }));
  assert.throws(() => getDocumentLimits({ DOCUMENT_MAX_FILE_BYTES: "999999999" }));
});

test("document mutations reject cross-site origins and memory slots recover after failure", async () => {
  const savedOrigin = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = "https://app.example";
  try {
    assert.throws(() => requireDocumentOrigin(new Request("https://app.example", { headers: { origin: "https://evil.example" } })), { status: 403 });
    requireDocumentOrigin(new Request("https://app.example", { headers: { origin: "https://app.example" } }));
  } finally { if (savedOrigin === undefined) delete process.env.BETTER_AUTH_URL; else process.env.BETTER_AUTH_URL = savedOrigin; }
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const slots = Array.from({ length: 4 }, () => withDocumentUploadSlot(() => gate));
  await assert.rejects(withDocumentUploadSlot(async () => {}), { status: 429 });
  release(); await Promise.all(slots);
  await assert.rejects(withDocumentUploadSlot(async () => { throw new Error("failed"); }));
  await withDocumentUploadSlot(async () => {});
});

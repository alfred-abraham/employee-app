import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { ServiceError } from "./http";
import { defaultDocumentLimits, type DocumentCategory, type DocumentLimits } from "./document-policy";

export function getDocumentLimits(env: Record<string, string | undefined> = process.env): DocumentLimits {
  const setting = (name: string, fallback: number, ceiling: number) => {
    if (!env[name]) return fallback;
    const value = Number(env[name]);
    if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) throw new ServiceError("Document storage limits are misconfigured. Contact the application owner.", 503);
    return value;
  };
  return {
    maxFileBytes: setting("DOCUMENT_MAX_FILE_BYTES", defaultDocumentLimits.maxFileBytes, 20 * 1024 * 1024),
    maxDocuments: setting("DOCUMENT_MAX_COUNT", defaultDocumentLimits.maxDocuments, 100),
    maxTotalBytes: setting("DOCUMENT_MAX_TOTAL_BYTES", defaultDocumentLimits.maxTotalBytes, 1024 * 1024 * 1024),
  };
}

export function validateDocumentId(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new ServiceError("Invalid document identifier.", 400);
  return id.toLowerCase();
}

export function validateDocument(data: Buffer, name: string, mime: string, category: string, limits: DocumentLimits) {
  if (data.length === 0) throw new ServiceError("Choose a file that is not empty.", 400);
  if (data.length > limits.maxFileBytes) throw new ServiceError("This file exceeds the upload size limit.", 413);
  const originalName = name.normalize("NFC").trim();
  if (!originalName || originalName.length > 200 || /[\x00-\x1f\x7f/\\]/.test(originalName)) throw new ServiceError("Choose a filename of 1–200 characters without control characters or path separators.", 400);
  if (category !== "resume" && category !== "other") throw new ServiceError("Choose Resume or Other document.", 400);
  let contentType: string;
  if (/\.pdf$/i.test(originalName)) {
    contentType = "application/pdf";
    if (!/^%PDF-1\.[0-7]|^%PDF-2\.0/.test(data.subarray(0, 8).toString("ascii")) || !data.subarray(-1024).toString("ascii").includes("%%EOF")) throw new ServiceError("This file is not a valid PDF document.", 400);
  } else if (/\.docx$/i.test(originalName)) {
    contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    try {
      if (data.readUInt32LE(0) !== 0x04034b50) throw new Error("Not a ZIP");
      const archive = new AdmZip(data);
      const entries = archive.getEntries();
      const names = new Set(entries.map((entry) => entry.entryName));
      if (entries.length > 2000 || names.size !== entries.length || entries.some((entry) => (entry.header.flags & 1) || /vbaProject\.bin$/i.test(entry.entryName)) || entries.reduce((size, entry) => size + entry.header.size, 0) > 40 * 1024 * 1024) throw new Error("Unsafe archive");
      const types = archive.getEntry("[Content_Types].xml");
      const document = archive.getEntry("word/document.xml");
      if (!types || !document || types.header.size > 100_000 || document.header.size > 10 * 1024 * 1024) throw new Error("Missing document parts");
      const readXml = (entry: AdmZip.IZipEntry) => {
        const compressed = entry.getCompressedData();
        const bytes = entry.header.method === 0 ? compressed : entry.header.method === 8 ? inflateRawSync(compressed, { maxOutputLength: entry.header.size + 1 }) : null;
        if (!bytes || bytes.length !== entry.header.size) throw new Error("Invalid compressed content");
        return bytes.toString("utf8");
      };
      if (!readXml(types).includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml") || !/<(?:[\w]+:)?document[\s>]/.test(readXml(document))) throw new Error("Invalid document parts");
    } catch { throw new ServiceError("This file is not a supported DOCX document. Encrypted files and macro-enabled documents are not supported.", 400); }
  } else throw new ServiceError("Choose a PDF or DOCX document.", 400);
  if (mime && mime !== "application/octet-stream" && mime !== contentType) throw new ServiceError("The file contents, extension, and file type must match.", 400);
  return { originalName, contentType, category: category as DocumentCategory, byteSize: data.length, sha256: createHash("sha256").update(data).digest("hex") };
}

// Count actual streamed bytes; Content-Length alone does not bound chunked requests.
export async function readDocumentBody(request: Request, maxBytes: number): Promise<Buffer> {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new ServiceError("This file exceeds the upload size limit.", 413);
  if (!request.body) throw new ServiceError("Choose a file to upload.", 400);
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new ServiceError("This file exceeds the upload size limit.", 413); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size);
  } finally { reader.releaseLock(); }
}

export function documentDisposition(name: string) {
  const fallback = name.replace(/[^a-zA-Z0-9._ -]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

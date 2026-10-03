import { Storage } from "@google-cloud/storage";
import { Readable } from "node:stream";
import { ServiceError } from "./http";
import type { DocumentRecord, DocumentStorage } from "./document-service";

export function createDocumentStorage(client = new Storage({ retryOptions: { maxRetries: 2, totalTimeout: 30 } })): DocumentStorage {
  const file = (document: DocumentRecord) => {
    // The SDK coerces generation strings to Number internally. Fail closed instead of rounding a version.
    if (document.generation && (!/^\d+$/.test(document.generation) || !Number.isSafeInteger(Number(document.generation)))) throw new ServiceError("The stored document version cannot be accessed safely. Contact the application owner.", 503);
    return client.bucket(document.bucket).file(document.objectKey, document.generation ? { generation: document.generation } : undefined);
  };
  return {
    async save(document, data) {
      const object = file(document);
      await object.save(data, {
        resumable: false, validation: "crc32c", timeout: 30_000,
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { contentType: document.contentType, cacheControl: "private, no-store", metadata: { sha256: document.sha256 } },
      });
      const [metadata] = await object.getMetadata();
      if (!metadata.generation || !Number.isSafeInteger(Number(metadata.generation))) throw new Error("Missing or unsupported object generation");
      return String(metadata.generation);
    },
    async delete(document) {
      // Generation-specific deletion cannot remove a different object version.
      await file(document).delete({ ignoreNotFound: true });
    },
    async download(document) {
      const object = file(document);
      try { await object.getMetadata(); }
      catch (error) {
        if ((error as { code?: number }).code === 404) throw new ServiceError("The stored document is unavailable. Contact the application owner.", 404);
        throw error;
      }
      return Readable.toWeb(object.createReadStream()) as ReadableStream<Uint8Array>;
    },
  };
}

export const documentStorage = createDocumentStorage();

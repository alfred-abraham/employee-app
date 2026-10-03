import { ServiceError } from "./http";
import type { DocumentCategory, DocumentStatus } from "./document-policy";

export type DocumentRecord = {
  id: string; userId: string | null; uploadKey: string; originalName: string;
  category: DocumentCategory; contentType: string; byteSize: number; sha256: string;
  bucket: string; objectKey: string; generation: string | null; status: DocumentStatus;
  createdAt: Date; updatedAt: Date;
};
export type UploadInput = Pick<DocumentRecord, "originalName" | "category" | "contentType" | "byteSize" | "sha256">;
export interface DocumentRepository {
  reserve(userId: string, uploadKey: string, input: UploadInput): Promise<{ document: DocumentRecord; claimed: boolean }>;
  owned(userId: string, id: string): Promise<DocumentRecord | null>;
  ready(userId: string, id: string, generation: string): Promise<boolean>;
  deleting(id: string): Promise<void>;
  remove(id: string): Promise<void>;
}
export interface DocumentStorage {
  save(document: DocumentRecord, data: Buffer): Promise<string>;
  delete(document: DocumentRecord): Promise<void>;
  download(document: DocumentRecord): Promise<ReadableStream<Uint8Array>>;
}

export function publicDocument(document: DocumentRecord) {
  const { id, originalName, category, contentType, byteSize, createdAt, status } = document;
  return { id, originalName, category, contentType, byteSize, createdAt: createdAt.toISOString(), status };
}

export function createDocumentService(repository: DocumentRepository, storage: DocumentStorage) {
  async function owned(userId: string, id: string) {
    const document = await repository.owned(userId, id);
    if (!document) throw new ServiceError("Document not found.", 404);
    return document;
  }
  return {
    async upload(userId: string, uploadKey: string, input: UploadInput, data: Buffer) {
      const reservation = await repository.reserve(userId, uploadKey, input);
      let document = reservation.document;
      if (!reservation.claimed) {
        if (document.sha256 !== input.sha256 || document.originalName !== input.originalName || document.category !== input.category || document.contentType !== input.contentType) throw new ServiceError("This upload identifier was already used for a different document. Choose the file again.", 409);
        if (document.status !== "ready") throw new ServiceError("This upload is still processing or awaiting cleanup. Refresh the list, or choose the file again to start a new upload.", 409);
        return publicDocument(document);
      }
      try {
        const generation = await storage.save(document, data);
        document = { ...document, generation };
        if (!await repository.ready(userId, document.id, generation)) throw new Error("Upload owner or state changed");
        return publicDocument({ ...document, status: "ready" });
      } catch (error) {
        // The reservation is already durable. Never lose the reference if either cleanup step fails.
        let markedForCleanup = false;
        try { await repository.deleting(document.id); markedForCleanup = true; } catch {}
        // A lost SQL response can hide a committed ready update. Keep its bytes if SQL cannot
        // confirm the transition; a ready retry can then recover, or a pending row can be swept.
        if (markedForCleanup) await storage.delete(document).catch(() => {});
        console.error("Document upload failed", { documentId: document.id, error });
        throw new ServiceError("The document could not be saved. Choose the file again to retry; any incomplete upload will be cleaned up.", 503);
      }
    },
    async download(userId: string, id: string) {
      const document = await owned(userId, id);
      if (document.status !== "ready" || !document.generation) throw new ServiceError("This document is not available for download.", 409);
      return { document, stream: await storage.download(document) };
    },
    async delete(userId: string, id: string) {
      const document = await repository.owned(userId, id);
      // Missing and foreign IDs are indistinguishable; repeating a completed deletion succeeds.
      if (!document) return;
      if (document.status === "pending") throw new ServiceError("This upload is still processing. Incomplete uploads are cleaned up automatically.", 409);
      await repository.deleting(document.id);
      try {
        await storage.delete(document);
        await repository.remove(document.id);
      } catch (error) {
        console.error("Document deletion needs retry", { documentId: document.id, error });
        throw new ServiceError("Deletion is pending. Retry Remove; automatic cleanup will also retry it.", 503);
      }
    },
  };
}

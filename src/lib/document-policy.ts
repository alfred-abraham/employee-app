export type DocumentCategory = "resume" | "other";
export type DocumentStatus = "pending" | "ready" | "deleting";
export type DocumentLimits = { maxFileBytes: number; maxDocuments: number; maxTotalBytes: number };
export type ProfileDocument = {
  id: string; originalName: string; category: DocumentCategory; contentType: string;
  byteSize: number; createdAt: string; status: DocumentStatus;
};
export const documentFormats = ["PDF", "DOCX"] as const;
export const defaultDocumentLimits: DocumentLimits = { maxFileBytes: 10 * 1024 * 1024, maxDocuments: 20, maxTotalBytes: 100 * 1024 * 1024 };
export function formatDocumentBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

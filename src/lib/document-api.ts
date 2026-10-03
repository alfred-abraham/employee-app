import { NextResponse } from "next/server";
import { ServiceError } from "./http";

export function documentApiError(error: unknown) {
  const status = error instanceof ServiceError ? error.status : 503;
  if (!(error instanceof ServiceError)) console.error("Document service failed", error);
  return NextResponse.json({ error: error instanceof ServiceError ? error.message : "Document storage is temporarily unavailable. Please retry." }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function requireDocumentOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.BETTER_AUTH_URL || request.url).origin;
  if ((origin && origin !== expected) || request.headers.get("sec-fetch-site") === "cross-site") throw new ServiceError("This document request must come from the application.", 403);
}

// Bound buffering/ZIP parsing memory per Cloud Run instance, independently of its HTTP concurrency.
let activeUploads = 0;
export async function withDocumentUploadSlot<T>(operation: () => Promise<T>): Promise<T> {
  if (activeUploads >= 4) throw new ServiceError("Uploads are busy. Please retry shortly.", 429);
  activeUploads++;
  try { return await operation(); } finally { activeUploads--; }
}

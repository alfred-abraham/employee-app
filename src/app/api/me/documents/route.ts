import { NextResponse } from "next/server";
import { authenticationRequired, getRequestSession } from "@/lib/auth-session";
import { documentApiError, requireDocumentOrigin, withDocumentUploadSlot } from "@/lib/document-api";
import { documentBucket, documentRepository, listDocuments } from "@/lib/document-repository";
import { createDocumentService, publicDocument } from "@/lib/document-service";
import { documentStorage } from "@/lib/document-storage";
import { getDocumentLimits, readDocumentBody, validateDocument, validateDocumentId } from "@/lib/document-validation";
import { ServiceError } from "@/lib/http";

export const runtime = "nodejs";
const service = createDocumentService(documentRepository, documentStorage);

export async function GET(request: Request) {
  try {
    const session = await getRequestSession(request);
    if (!session) return authenticationRequired();
    const documents = await listDocuments(session.user.id);
    return NextResponse.json({ documents: documents.map(publicDocument), limits: getDocumentLimits(), configured: Boolean(process.env.DOCUMENTS_BUCKET) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return documentApiError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await getRequestSession(request);
    if (!session) return authenticationRequired();
    requireDocumentOrigin(request);
    documentBucket();
    const uploadKey = validateDocumentId(request.headers.get("idempotency-key") ?? "");
    let name: string;
    try { name = decodeURIComponent(request.headers.get("x-document-name") ?? ""); }
    catch { throw new ServiceError("Invalid document filename.", 400); }
    return await withDocumentUploadSlot(async () => {
      const limits = getDocumentLimits();
      const data = await readDocumentBody(request, limits.maxFileBytes);
      const input = validateDocument(data, name, request.headers.get("content-type") ?? "", request.headers.get("x-document-category") ?? "", limits);
      const document = await service.upload(session.user.id, uploadKey, input, data);
      return NextResponse.json({ document }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
    });
  } catch (error) { return documentApiError(error); }
}

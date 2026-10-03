import { NextResponse } from "next/server";
import { authenticationRequired, getRequestSession } from "@/lib/auth-session";
import { documentApiError, requireDocumentOrigin } from "@/lib/document-api";
import { documentRepository } from "@/lib/document-repository";
import { createDocumentService } from "@/lib/document-service";
import { documentStorage } from "@/lib/document-storage";
import { documentDisposition, validateDocumentId } from "@/lib/document-validation";

export const runtime = "nodejs";
const service = createDocumentService(documentRepository, documentStorage);
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const session = await getRequestSession(request);
    if (!session) return authenticationRequired();
    const id = validateDocumentId((await context.params).id);
    const { document, stream } = await service.download(session.user.id, id);
    return new NextResponse(stream, { headers: {
      "Content-Type": document.contentType,
      "Content-Disposition": documentDisposition(document.originalName),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    } });
  } catch (error) { return documentApiError(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const session = await getRequestSession(request);
    if (!session) return authenticationRequired();
    requireDocumentOrigin(request);
    await service.delete(session.user.id, validateDocumentId((await context.params).id));
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return documentApiError(error); }
}

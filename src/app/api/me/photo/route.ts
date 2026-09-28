import { NextRequest, NextResponse } from "next/server";
import { authenticationRequired, getRequestSession } from "@/lib/auth-session";
import { apiError, ServiceError } from "@/lib/http";
import { getProfilePhoto, maxPhotoBytes, preparePhoto, removeProfilePhoto, saveProfilePhoto } from "@/lib/profile-photo";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) return authenticationRequired();
  try {
    const photo = await getProfilePhoto(session.user.id);
    if (!photo) return NextResponse.json({ error: "No profile photo." }, { status: 404 });
    return new NextResponse(new Uint8Array(Buffer.from(photo.data, "base64")), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) return authenticationRequired();
  try {
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > maxPhotoBytes + 100_000) throw new ServiceError("Choose an image under 5 MB.", 413);
    const form = await request.formData();
    const file = form.get("photo");
    if (!(file instanceof File)) throw new ServiceError("Choose an image to upload.", 400);
    if (file.size > maxPhotoBytes) throw new ServiceError("Choose an image under 5 MB.", 413);
    const data = await preparePhoto(Buffer.from(await file.arrayBuffer()), file.type);
    await saveProfilePhoto(session.user.id, data);
    return NextResponse.json({ image: "/api/me/photo" });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) return authenticationRequired();
  try { await removeProfilePhoto(session.user.id); return new NextResponse(null, { status: 204 }); }
  catch (error) { return apiError(error); }
}

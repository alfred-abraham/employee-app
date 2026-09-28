import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profilePhotos, user } from "@/db/schema";
import { ServiceError } from "./http";

export const maxPhotoBytes = 5 * 1024 * 1024;

export async function preparePhoto(input: Buffer, mimeType: string) {
  if (!(["image/jpeg", "image/png", "image/webp"].includes(mimeType)) || input.length === 0 || input.length > maxPhotoBytes) {
    throw new ServiceError("Choose a JPEG, PNG, or WebP image under 5 MB.", 400);
  }
  try {
    const decoder = sharp(input, { limitInputPixels: 40_000_000, failOn: "error" });
    const metadata = await decoder.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) throw new Error("Unsupported image");
    const output = await decoder.rotate().resize(512, 512, { fit: "cover", position: "attention" }).webp({ quality: 78 }).toBuffer();
    if (output.length > 500_000) throw new Error("Processed image is too large");
    return output.toString("base64");
  } catch {
    throw new ServiceError("This image could not be processed. Choose another JPEG, PNG, or WebP file.", 400);
  }
}

export async function getProfilePhoto(userId: string) {
  return (await db.select({ data: profilePhotos.data }).from(profilePhotos).where(eq(profilePhotos.userId, userId)).limit(1))[0] ?? null;
}

export async function saveProfilePhoto(userId: string, data: string) {
  await db.transaction(async (tx) => {
    await tx.insert(profilePhotos).values({ userId, data }).onConflictDoUpdate({ target: profilePhotos.userId, set: { data, updatedAt: new Date() } });
    await tx.update(user).set({ image: "/api/me/photo", updatedAt: new Date() }).where(eq(user.id, userId));
  });
}

export async function removeProfilePhoto(userId: string) {
  await db.transaction(async (tx) => {
    await tx.delete(profilePhotos).where(eq(profilePhotos.userId, userId));
    await tx.update(user).set({ image: null, updatedAt: new Date() }).where(eq(user.id, userId));
  });
}

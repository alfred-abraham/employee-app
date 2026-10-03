import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { profileDocuments, user } from "@/db/schema";
import { ServiceError } from "./http";
import { getDocumentLimits } from "./document-validation";
import type { DocumentRepository } from "./document-service";

export function documentBucket() {
  const bucket = process.env.DOCUMENTS_BUCKET;
  if (!bucket || !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucket)) throw new ServiceError("Document storage is not configured. Contact the application owner.", 503);
  return bucket;
}

export function createDocumentRepository(database = db, bucketSetting = documentBucket, limitsSetting = getDocumentLimits): DocumentRepository {
  return {
    async reserve(userId, uploadKey, input) {
      const bucket = bucketSetting();
      const limits = limitsSetting();
      return database.transaction(async (tx) => {
        // Serializes quota checks and reservation creation across all app instances for this owner.
        const account = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
        if (!account.length) throw new ServiceError("Authentication required.", 401);
        const existing = await tx.select().from(profileDocuments).where(and(eq(profileDocuments.userId, userId), eq(profileDocuments.uploadKey, uploadKey))).limit(1);
        if (existing[0]) return { document: existing[0], claimed: false };
        const [usage] = await tx.select({ count: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${profileDocuments.byteSize}), 0)::bigint` }).from(profileDocuments).where(eq(profileDocuments.userId, userId));
        if (usage.count >= limits.maxDocuments || Number(usage.bytes) + input.byteSize > limits.maxTotalBytes) throw new ServiceError("Your document storage limit is reached. Remove a document before uploading another.", 409);
        const id = randomUUID();
        const [document] = await tx.insert(profileDocuments).values({ ...input, id, userId, uploadKey, bucket, objectKey: `profile-documents/${id}` }).returning();
        return { document, claimed: true };
      });
    },
    async owned(userId, id) {
      return (await database.select().from(profileDocuments).where(and(eq(profileDocuments.id, id), eq(profileDocuments.userId, userId))).limit(1))[0] ?? null;
    },
    async ready(userId, id, generation) {
      return (await database.update(profileDocuments).set({ status: "ready", generation, updatedAt: new Date() }).where(and(eq(profileDocuments.id, id), eq(profileDocuments.userId, userId), eq(profileDocuments.status, "pending"))).returning({ id: profileDocuments.id })).length > 0;
    },
    async deleting(id) { await database.update(profileDocuments).set({ status: "deleting", updatedAt: new Date() }).where(eq(profileDocuments.id, id)); },
    async remove(id) { await database.delete(profileDocuments).where(and(eq(profileDocuments.id, id), eq(profileDocuments.status, "deleting"))); },
  };
}
export const documentRepository = createDocumentRepository();

export async function listDocuments(userId: string, database = db) {
  return database.select().from(profileDocuments).where(eq(profileDocuments.userId, userId)).orderBy(desc(profileDocuments.createdAt), desc(profileDocuments.id));
}

export async function claimDocumentCleanup(batchSize = 100, database = db) {
  // Leave a one-hour grace period for interrupted network requests to settle.
  const cutoff = new Date(Date.now() - 60 * 60 * 1000);
  return database.transaction(async (tx) => {
    const rows = await tx.select().from(profileDocuments).where(and(lt(profileDocuments.updatedAt, cutoff), or(ne(profileDocuments.status, "ready"), isNull(profileDocuments.userId)))).orderBy(profileDocuments.updatedAt).limit(batchSize).for("update", { skipLocked: true });
    if (!rows.length) return [];
    for (const row of rows) await tx.update(profileDocuments).set({ status: "deleting", updatedAt: new Date() }).where(eq(profileDocuments.id, row.id));
    return rows;
  });
}

import "server-only";
import { and, eq, gt, isNull, notExists, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accountBlocks, accountBlockAudit, session, user, userRoles } from "@/db/schema";
import { isBlockActive, blockInput, unblockInput } from "./account-block-policy";
import { activeRoles, permits } from "./role-policy";
import { ServiceError } from "./http";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function isAccountBlocked(userId: string) {
  const [block] = await db.select().from(accountBlocks).where(eq(accountBlocks.userId, userId));
  return isBlockActive(block);
}
export async function isEmailBlocked(email: string) {
  const [block] = await db.select({ userId: accountBlocks.userId }).from(accountBlocks)
    .innerJoin(user, eq(user.id, accountBlocks.userId)).where(and(
      sql`lower(trim(${user.email})) = ${email.trim().toLowerCase()}`,
      or(isNull(accountBlocks.expiresAt), gt(accountBlocks.expiresAt, new Date())),
    )).limit(1);
  return Boolean(block);
}
export async function requireUnblockedAdmin(tx: Transaction, actorId: string) {
  const [block] = await tx.select().from(accountBlocks).where(eq(accountBlocks.userId, actorId));
  const grants = await tx.select().from(userRoles).where(eq(userRoles.userId, actorId));
  if (isBlockActive(block) || !permits(activeRoles(grants), "admin")) throw new ServiceError("Administrator access required.", 403);
}
export async function ensurePermanentAdmin(tx: Transaction) {
  const blocked = tx.select({ id: accountBlocks.userId }).from(accountBlocks).where(and(
    eq(accountBlocks.userId, userRoles.userId), or(isNull(accountBlocks.expiresAt), gt(accountBlocks.expiresAt, new Date())),
  ));
  const admins = await tx.select({ id: userRoles.userId }).from(userRoles).where(and(eq(userRoles.role, "admin"), isNull(userRoles.expiresAt), notExists(blocked))).limit(1);
  if (!admins.length) throw new ServiceError("Keep at least one unblocked administrator with no role expiry.", 409);
}
export async function changeAccountBlock(actorId: string, targetUserId: string, reason: string, expiresAt: string | null, unblock = false) {
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(741027)`);
    await requireUnblockedAdmin(tx, actorId);
    if (!unblock && actorId === targetUserId) throw new ServiceError("You cannot block your own account.", 409);
    const parsed = (unblock ? unblockInput : blockInput()).safeParse(unblock ? { reason } : { reason, expiresAt });
    if (!parsed.success) throw new ServiceError(parsed.error.issues[0].message, 400);
    const [target] = await tx.select({ id: user.id }).from(user).where(eq(user.id, targetUserId));
    if (!target) throw new ServiceError("User not found.", 404);
    const [previous] = await tx.select().from(accountBlocks).where(eq(accountBlocks.userId, targetUserId));
    if (unblock && !previous) throw new ServiceError("Account is not blocked.", 404);
    if (unblock) await tx.delete(accountBlocks).where(eq(accountBlocks.userId, targetUserId));
    else await tx.insert(accountBlocks).values({ userId: targetUserId, actorId, reason: parsed.data.reason, expiresAt: expiresAt ? new Date(expiresAt) : null })
      .onConflictDoUpdate({ target: accountBlocks.userId, set: { actorId, reason: parsed.data.reason, expiresAt: expiresAt ? new Date(expiresAt) : null, updatedAt: new Date() } });
    await ensurePermanentAdmin(tx);
    // Removing sessions on both transitions also prevents a raced or previously invalidated session returning.
    await tx.delete(session).where(eq(session.userId, targetUserId));
    await tx.insert(accountBlockAudit).values({ actorId, targetUserId, action: unblock ? "unblock" : "block", reason: parsed.data.reason,
      previouslyBlocked: isBlockActive(previous), previousExpiresAt: previous?.expiresAt ?? null, expiresAt: unblock || !expiresAt ? null : new Date(expiresAt) });
  });
}

// Session hooks run outside the auth adapter transaction. Recheck after creation under the
// same lock as moderation to close a sign-in that started just before the account was blocked.
export async function acceptCreatedSession(userId: string, sessionId: string) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(741027)`);
    const [block] = await tx.select().from(accountBlocks).where(eq(accountBlocks.userId, userId));
    const [stored] = await tx.select({ id: session.id }).from(session).where(and(eq(session.id, sessionId), eq(session.userId, userId)));
    if (isBlockActive(block)) await tx.delete(session).where(eq(session.userId, userId));
    return !isBlockActive(block) && Boolean(stored);
  });
}

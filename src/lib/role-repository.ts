import "server-only";

import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { roleAudit, user, userRoles, userSignIns } from "@/db/schema";
import { ServiceError } from "@/lib/http";
import { accessStatus, activeRoles, hasPermanentAdmin, permits, roleInput, type Role } from "@/lib/role-policy";

export async function getActiveRoles(userId: string) {
  return activeRoles(await db.select().from(userRoles).where(eq(userRoles.userId, userId)));
}

export async function recordSignIn(userId: string, at: Date) {
  await db.insert(userSignIns).values({ userId, firstSignInAt: at, lastSignInAt: at }).onConflictDoUpdate({
    target: userSignIns.userId,
    set: { firstSignInAt: sql`least(${userSignIns.firstSignInAt}, ${at.toISOString()}::timestamptz)`, lastSignInAt: sql`greatest(${userSignIns.lastSignInAt}, ${at.toISOString()}::timestamptz)` },
  });
}

export async function listUsers(search: string, page: number) {
  const escaped = search.replace(/[\\%_]/g, "\\$&");
  const filter = search ? or(ilike(user.name, `%${escaped}%`), ilike(user.email, `%${escaped}%`)) : undefined;
  const accounts = await db.select({ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt,
    firstSignInAt: userSignIns.firstSignInAt, lastSignInAt: userSignIns.lastSignInAt }).from(user)
    .leftJoin(userSignIns, eq(user.id, userSignIns.userId)).where(filter).orderBy(asc(user.name), asc(user.id)).limit(25).offset((page - 1) * 25);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(user).where(filter);
  const grants = accounts.length ? await db.select().from(userRoles).where(inArray(userRoles.userId, accounts.map((account) => account.id))) : [];
  const now = new Date();
  return { users: accounts.map((account) => {
    const assignments = grants.filter((grant) => grant.userId === account.id);
    return { ...account, assignments, status: accessStatus(assignments, now) };
  }), pagination: { page, total, totalPages: Math.max(1, Math.ceil(total / 25)) } };
}

export async function changeRole(actorId: string, targetUserId: string, role: Role, expiresAt: string | null, revoke = false) {
  return db.transaction(async (tx) => {
    // Serialize administration and bootstrap operations, then recheck the actor under the lock.
    await tx.execute(sql`select pg_advisory_xact_lock(741027)`);
    const actorGrants = await tx.select().from(userRoles).where(eq(userRoles.userId, actorId));
    if (!permits(activeRoles(actorGrants), "admin")) throw new ServiceError("Administrator access required.", 403);
    if (!revoke && !roleInput().safeParse({ role, expiresAt }).success) throw new ServiceError("Expiry must be in the future or empty for no expiry.", 400);
    const [target] = await tx.select({ id: user.id }).from(user).where(eq(user.id, targetUserId));
    if (!target) throw new ServiceError("User not found.", 404);
    const predicate = and(eq(userRoles.userId, targetUserId), eq(userRoles.role, role));
    const [previous] = await tx.select().from(userRoles).where(predicate);
    if (revoke && !previous) throw new ServiceError("Role assignment not found.", 404);
    if (revoke) await tx.delete(userRoles).where(predicate);
    else await tx.insert(userRoles).values({ userId: targetUserId, role, expiresAt: expiresAt ? new Date(expiresAt) : null })
      .onConflictDoUpdate({ target: [userRoles.userId, userRoles.role], set: { expiresAt: expiresAt ? new Date(expiresAt) : null, updatedAt: new Date() } });
    if (!hasPermanentAdmin(await tx.select().from(userRoles).where(eq(userRoles.role, "admin")))) {
      throw new ServiceError("Keep at least one administrator with no expiry. Grant another permanent admin before changing this assignment.", 409);
    }
    await tx.insert(roleAudit).values({ actorId, targetUserId, role, action: revoke ? "revoke" : previous ? "change" : "grant",
      previousExpiresAt: previous?.expiresAt ?? null, expiresAt: revoke || !expiresAt ? null : new Date(expiresAt) });
  });
}

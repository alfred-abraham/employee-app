import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { employees, user } from "@/db/schema";
import { ServiceError } from "./http";

export type EmployeeTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const ownershipConflict = () => new ServiceError("Your employee record association needs administrator review.", 409);

// Employee mutations and self-service claims share this lock, including admin changes.
export async function lockEmployeeOwnership(tx: EmployeeTransaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(741028)`);
}

export async function resolveMyEmployee(tx: EmployeeTransaction, accountId: string, email: string, verified: boolean) {
  const [linked] = await tx.select().from(employees).where(eq(employees.userId, accountId)).limit(1);
  if (linked) return linked;
  if (!verified) return null;
  const normalized = email.trim().toLowerCase();
  const accounts = await tx.select({ id: user.id }).from(user).where(sql`lower(trim(${user.email})) = ${normalized}`).limit(2);
  if (accounts.length !== 1 || accounts[0].id !== accountId) throw ownershipConflict();
  const matches = await tx.select().from(employees).where(sql`lower(trim(${employees.email})) = ${normalized}`).limit(2);
  if (!matches.length) return null;
  if (matches.length !== 1 || matches[0].userId !== null) throw ownershipConflict();
  return (await tx.update(employees).set({ userId: accountId }).where(and(eq(employees.id, matches[0].id), isNull(employees.userId))).returning())[0];
}

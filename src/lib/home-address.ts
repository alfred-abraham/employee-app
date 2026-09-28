import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { employeeHomeAddress, employees } from "@/db/schema";
import { ServiceError } from "./http";

export const homeAddressSchema = z.object({
  line1: z.string().trim().min(3).max(160),
  line2: z.string().trim().max(160).optional().nullable(),
  city: z.string().trim().min(1).max(100),
  region: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(2).max(30),
  country: z.string().trim().min(2).max(100),
  placeId: z.string().trim().max(255).optional().nullable(),
});
export type HomeAddressInput = z.infer<typeof homeAddressSchema>;

export async function findMyEmployee(userId: string, email: string, emailVerified: boolean) {
  const linked = (await db.select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName }).from(employees).where(eq(employees.userId, userId)).limit(1))[0];
  if (linked || !emailVerified) return linked ?? null;
  const matches = await db.select({ id: employees.id }).from(employees).where(sql`lower(${employees.email}) = lower(${email})`).limit(2);
  if (matches.length !== 1) return null;
  const [claimed] = await db.update(employees).set({ userId }).where(and(eq(employees.id, matches[0].id), sql`${employees.userId} is null`)).returning({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName });
  return claimed ?? null;
}

export async function readMyAddress(employeeId: string) {
  return (await db.select().from(employeeHomeAddress).where(eq(employeeHomeAddress.employeeId, employeeId)).limit(1))[0] ?? null;
}

export async function saveMyAddress(employeeId: string, input: HomeAddressInput) {
  const values = { employeeId, line1: input.line1, line2: input.line2 || null, city: input.city, region: input.region, postalCode: input.postalCode, country: input.country, placeId: input.placeId || null, updatedAt: new Date() };
  return (await db.insert(employeeHomeAddress).values(values).onConflictDoUpdate({ target: employeeHomeAddress.employeeId, set: values }).returning())[0];
}

export function requireLinkedEmployee<T>(employee: T | null): T {
  if (!employee) throw new ServiceError("No employee record is linked to your verified account. Contact the application owner.", 403);
  return employee;
}

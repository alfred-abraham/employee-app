import { and, asc, count, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { employees } from "@/db/schema";
import type { EmployeeInput } from "./employee-validation";

export async function listEmployees(filters: { search?: string; department?: string; status?: string }) {
  const clauses = [];
  if (filters.search) {
    const term = `%${filters.search}%`;
    clauses.push(or(ilike(employees.firstName, term), ilike(employees.lastName, term), ilike(employees.email, term), ilike(employees.jobTitle, term))!);
  }
  if (filters.department) clauses.push(eq(employees.department, filters.department));
  if (filters.status) clauses.push(eq(employees.status, filters.status));
  return db.select().from(employees).where(clauses.length ? and(...clauses) : undefined).orderBy(asc(employees.lastName), asc(employees.firstName));
}

export async function getEmployee(id: string) {
  return (await db.select().from(employees).where(eq(employees.id, id)).limit(1))[0] ?? null;
}

export async function createEmployee(input: EmployeeInput) {
  return (await db.insert(employees).values(input).returning())[0];
}

export async function updateEmployee(id: string, input: Partial<EmployeeInput>) {
  return (await db.update(employees).set({ ...input, updatedAt: new Date() }).where(eq(employees.id, id)).returning())[0] ?? null;
}

export async function deleteEmployee(id: string) {
  return (await db.delete(employees).where(eq(employees.id, id)).returning({ id: employees.id }))[0] ?? null;
}

export async function employeeStats() {
  const [summary] = await db.select({ total: count(), departments: sql<number>`count(distinct ${employees.department})`, onLeave: sql<number>`count(*) filter (where ${employees.status} = 'on_leave')` }).from(employees);
  return { total: Number(summary.total), departments: Number(summary.departments), onLeave: Number(summary.onLeave) };
}

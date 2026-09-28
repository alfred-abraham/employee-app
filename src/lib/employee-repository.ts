import { and, asc, count, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { employees } from "@/db/schema";
import type { EmployeeInput } from "./employee-validation";
import { escapeLike, type EmployeeQuery } from "./employee-query";

export async function listEmployees(filters: EmployeeQuery) {
  const clauses = [];
  if (filters.search) {
    const term = `%${escapeLike(filters.search)}%`;
    const fullName = sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`;
    clauses.push(or(ilike(employees.firstName, term), ilike(employees.lastName, term), ilike(fullName, term), ilike(employees.email, term), ilike(employees.company, term), ilike(employees.jobTitle, term))!);
  }
  if (filters.department) clauses.push(eq(employees.department, filters.department));
  if (filters.status) clauses.push(eq(employees.status, filters.status));
  const where = clauses.length ? and(...clauses) : undefined;
  const [totalRow] = await db.select({ total: count() }).from(employees).where(where);
  const total = Number(totalRow.total);
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const rows = filters.page > totalPages ? [] : await db.select().from(employees).where(where)
    .orderBy(asc(employees.lastName), asc(employees.firstName), asc(employees.id))
    .limit(filters.pageSize).offset((filters.page - 1) * filters.pageSize);
  return {
    employees: rows,
    pagination: { page: filters.page, pageSize: filters.pageSize, total, totalPages, hasPrevious: filters.page > 1 && total > 0, hasNext: filters.page < totalPages },
  };
}

export async function listDepartments() {
  const rows = await db.selectDistinct({ department: employees.department }).from(employees).orderBy(asc(employees.department));
  return rows.map((row) => row.department);
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

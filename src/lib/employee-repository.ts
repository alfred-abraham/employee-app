import { and, asc, count, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { departments, employees, timeAway } from "@/db/schema";
import type { EmployeeInput } from "./employee-validation";
import { escapeLike, type EmployeeQuery } from "./employee-query";

const directoryColumns = Object.fromEntries(Object.entries(getTableColumns(employees)).filter(([name]) => name !== "userId")) as Omit<ReturnType<typeof getTableColumns<typeof employees>>, "userId">;
const utcToday = sql`(now() at time zone 'UTC')::date`;
const onLeave = sql`exists (select 1 from ${timeAway} where ${timeAway.employeeId} = ${employees.id} and ${timeAway.status} = 'confirmed' and ${timeAway.startDate} <= ${utcToday} and ${timeAway.endDate} >= ${utcToday})`;
const effectiveStatus = sql<string>`case when ${employees.status} = 'inactive' then 'inactive' when ${onLeave} then 'on_leave' else 'active' end`;

async function requireActiveDepartment(name: string) {
  if (!(await db.select({ id: departments.id }).from(departments).where(and(eq(departments.name, name), eq(departments.active, true))).limit(1))[0]) {
    throw Object.assign(new Error("Choose an active department."), { code: "BAD_DEPARTMENT" });
  }
}

export async function listEmployees(filters: EmployeeQuery) {
  const clauses = [];
  if (filters.search) {
    const term = `%${escapeLike(filters.search)}%`;
    const fullName = sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`;
    clauses.push(or(ilike(employees.firstName, term), ilike(employees.lastName, term), ilike(fullName, term), ilike(employees.email, term), ilike(employees.company, term), ilike(employees.jobTitle, term))!);
  }
  if (filters.department) clauses.push(eq(employees.department, filters.department));
  if (filters.status) clauses.push(sql`${effectiveStatus} = ${filters.status}`);
  const where = clauses.length ? and(...clauses) : undefined;
  const [totalRow] = await db.select({ total: count() }).from(employees).where(where);
  const total = Number(totalRow.total);
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const rows = filters.page > totalPages ? [] : await db.select({ ...directoryColumns, status: effectiveStatus }).from(employees).where(where)
    .orderBy(asc(employees.lastName), asc(employees.firstName), asc(employees.id))
    .limit(filters.pageSize).offset((filters.page - 1) * filters.pageSize);
  return {
    employees: rows,
    pagination: { page: filters.page, pageSize: filters.pageSize, total, totalPages, hasPrevious: filters.page > 1 && total > 0, hasNext: filters.page < totalPages },
  };
}

export async function listDepartments() {
  const rows = await db.select({ name: departments.name }).from(departments).where(eq(departments.active, true)).orderBy(asc(departments.name));
  return rows.map((row) => row.name);
}

export async function getEmployee(id: string) {
  return (await db.select({ ...directoryColumns, status: effectiveStatus }).from(employees).where(eq(employees.id, id)).limit(1))[0] ?? null;
}

export async function createEmployee(input: EmployeeInput) {
  await requireActiveDepartment(input.department);
  return (await db.insert(employees).values(input).returning({ id: employees.id }))[0];
}

export async function updateEmployee(id: string, input: Partial<EmployeeInput>) {
  if (input.department) await requireActiveDepartment(input.department);
  return (await db.update(employees).set({ ...input, updatedAt: new Date() }).where(eq(employees.id, id)).returning({ id: employees.id }))[0] ?? null;
}

export async function deleteEmployee(id: string) {
  return (await db.delete(employees).where(eq(employees.id, id)).returning({ id: employees.id }))[0] ?? null;
}

export async function employeeStats() {
  const [summary] = await db.select({ total: count(), onLeave: sql<number>`count(*) filter (where ${onLeave} and ${employees.status} != 'inactive')` }).from(employees);
  const [teamCount] = await db.select({ total: count() }).from(departments).where(eq(departments.active, true));
  return { total: Number(summary.total), departments: Number(teamCount.total), onLeave: Number(summary.onLeave) };
}

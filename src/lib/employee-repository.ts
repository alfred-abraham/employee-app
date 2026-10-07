import { and, asc, count, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { departments, employees, timeAway } from "@/db/schema";
import type { EmployeeInput } from "./employee-validation";
import { escapeLike, type EmployeeQuery } from "./employee-query";
import { lockEmployeeOwnership, resolveMyEmployee } from "./employee-ownership";
import type { EmployeeActor } from "./employee-access";
import { ServiceError } from "./http";

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

export async function employeeOwnership(actor: EmployeeActor) {
  return db.transaction(async (tx) => {
    await lockEmployeeOwnership(tx);
    const employee = await resolveMyEmployee(tx, actor.id, actor.email, actor.emailVerified);
    if (!employee) return null;
    const { userId: _owner, ...record } = employee;
    void _owner;
    return record;
  });
}

function requireOwnIdentity(actor: EmployeeActor, email?: string) {
  if (!actor.emailVerified || (email !== undefined && email.trim().toLowerCase() !== actor.email.trim().toLowerCase())) {
    throw new ServiceError("Use your verified account email for your employee record.", 403);
  }
}

export async function createEmployee(input: EmployeeInput, actor: EmployeeActor) {
  await requireActiveDepartment(input.department);
  return db.transaction(async (tx) => {
    await lockEmployeeOwnership(tx);
    if (actor.isAdmin) return (await tx.insert(employees).values(input).returning({ id: employees.id }))[0];
    requireOwnIdentity(actor, input.email);
    if (await resolveMyEmployee(tx, actor.id, actor.email, true)) throw new ServiceError("Your employee record already exists. Edit it instead.", 409);
    return (await tx.insert(employees).values({ ...input, email: actor.email.trim().toLowerCase(), userId: actor.id }).returning({ id: employees.id }))[0];
  });
}

export async function updateEmployee(id: string, input: Partial<EmployeeInput>, actor: EmployeeActor) {
  if (input.department) await requireActiveDepartment(input.department);
  return db.transaction(async (tx) => {
    await lockEmployeeOwnership(tx);
    if (!actor.isAdmin) {
      requireOwnIdentity(actor, input.email);
      const owned = await resolveMyEmployee(tx, actor.id, actor.email, true);
      if (!owned || owned.id !== id) throw new ServiceError("You can only edit your own employee record.", 403);
    }
    const predicate = actor.isAdmin ? eq(employees.id, id) : and(eq(employees.id, id), eq(employees.userId, actor.id));
    return (await tx.update(employees).set({ ...input, updatedAt: new Date() }).where(predicate).returning({ id: employees.id }))[0] ?? null;
  });
}

export async function deleteEmployee(id: string) {
  return db.transaction(async (tx) => {
    await lockEmployeeOwnership(tx);
    return (await tx.delete(employees).where(eq(employees.id, id)).returning({ id: employees.id }))[0] ?? null;
  });
}

export async function employeeStats() {
  const [summary] = await db.select({ total: count(), onLeave: sql<number>`count(*) filter (where ${onLeave} and ${employees.status} != 'inactive')` }).from(employees);
  const [teamCount] = await db.select({ total: count() }).from(departments).where(eq(departments.active, true));
  return { total: Number(summary.total), departments: Number(teamCount.total), onLeave: Number(summary.onLeave) };
}

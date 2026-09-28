import { and, asc, count, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { employees, timeAway } from "@/db/schema";
import { ServiceError } from "./http";
import { escapeLike } from "./employee-query";

export type TimeAwayInput = {
  employeeId: string;
  type: "vacation" | "sick" | "personal" | "other";
  startDate: string;
  endDate: string;
  note?: string | null;
};

const today = () => new Date().toISOString().slice(0, 10);

export async function listTimeAway(options: { scope: string; page: number; employeeSearch?: string }) {
  const now = today();
  const clauses = [];
  if (options.employeeSearch) clauses.push(sql`exists (select 1 from ${employees} where ${employees.id} = ${timeAway.employeeId} and (${employees.firstName} || ' ' || ${employees.lastName}) ilike ${`%${escapeLike(options.employeeSearch)}%`})`);
  if (options.scope === "current") clauses.push(and(eq(timeAway.status, "confirmed"), lte(timeAway.startDate, now), gte(timeAway.endDate, now))!);
  if (options.scope === "upcoming") clauses.push(and(eq(timeAway.status, "confirmed"), gte(timeAway.startDate, now), ne(timeAway.startDate, now))!);
  if (options.scope === "past") clauses.push(and(eq(timeAway.status, "confirmed"), sql`${timeAway.endDate} < ${now}`)!);
  if (options.scope === "cancelled") clauses.push(eq(timeAway.status, "cancelled"));
  const where = clauses.length ? and(...clauses) : undefined;
  const [summary] = await db.select({ total: count() }).from(timeAway).where(where);
  const pageSize = 25;
  const total = Number(summary.total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rows = options.page > totalPages ? [] : await db.select({
    id: timeAway.id, employeeId: timeAway.employeeId, employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
    department: employees.department, type: timeAway.type, startDate: timeAway.startDate, endDate: timeAway.endDate,
    status: timeAway.status, note: timeAway.note,
  }).from(timeAway).innerJoin(employees, eq(timeAway.employeeId, employees.id)).where(where)
    .orderBy(asc(timeAway.startDate), asc(timeAway.id)).limit(pageSize).offset((options.page - 1) * pageSize);
  return { entries: rows, pagination: { page: options.page, pageSize, total, totalPages } };
}

async function saveTimeAway(input: TimeAwayInput, id?: string) {
  if (input.endDate < input.startDate) throw new ServiceError("End date must be on or after start date.", 400);
  return db.transaction(async (tx) => {
    const [employee] = await tx.select({ id: employees.id, status: employees.status }).from(employees).where(eq(employees.id, input.employeeId)).for("update").limit(1);
    if (!employee) throw new ServiceError("Employee not found.", 404);
    if (employee.status === "inactive") throw new ServiceError("Time away cannot be assigned to an inactive employee.", 400);
    const overlap = await tx.select({ id: timeAway.id }).from(timeAway).where(and(
      eq(timeAway.employeeId, input.employeeId), eq(timeAway.status, "confirmed"),
      lte(timeAway.startDate, input.endDate), gte(timeAway.endDate, input.startDate),
      id ? ne(timeAway.id, id) : undefined,
    )).limit(1);
    if (overlap.length) throw new ServiceError("This employee already has time away on those dates.", 409);
    if (id) {
      const [updated] = await tx.update(timeAway).set({ ...input, note: input.note || null, updatedAt: new Date() }).where(and(eq(timeAway.id, id), eq(timeAway.status, "confirmed"))).returning();
      if (!updated) throw new ServiceError("Time-away entry not found or cancelled.", 404);
      return updated;
    }
    return (await tx.insert(timeAway).values({ ...input, note: input.note || null }).returning())[0];
  });
}

export const createTimeAway = (input: TimeAwayInput) => saveTimeAway(input);
export const updateTimeAway = (id: string, input: TimeAwayInput) => saveTimeAway(input, id);

export async function cancelTimeAway(id: string) {
  const [updated] = await db.update(timeAway).set({ status: "cancelled", updatedAt: new Date() }).where(eq(timeAway.id, id)).returning();
  if (!updated) throw new ServiceError("Time-away entry not found.", 404);
  return updated;
}

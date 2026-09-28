import { and, asc, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { departments, employees } from "@/db/schema";
import { ServiceError } from "./http";

export async function departmentOverview() {
  return db.select({ id: departments.id, name: departments.name, active: departments.active, employeeCount: count(employees.id) })
    .from(departments).leftJoin(employees, eq(employees.department, departments.name))
    .groupBy(departments.id).orderBy(asc(departments.name));
}

export async function createDepartment(name: string) {
  const existing = (await db.select().from(departments).where(sql`lower(${departments.name}) = lower(${name})`).limit(1))[0];
  if (existing) throw new ServiceError("A department with that name already exists.", 409);
  return (await db.insert(departments).values({ name }).returning())[0];
}

export async function renameDepartment(id: string, name: string) {
  const existing = (await db.select({ id: departments.id }).from(departments).where(and(sql`lower(${departments.name}) = lower(${name})`, sql`${departments.id} != ${id}`)).limit(1))[0];
  if (existing) throw new ServiceError("A department with that name already exists.", 409);
  const updated = (await db.update(departments).set({ name }).where(eq(departments.id, id)).returning())[0];
  if (!updated) throw new ServiceError("Department not found.", 404);
  return updated;
}

export async function retireDepartment(id: string) {
  return db.transaction(async (tx) => {
    const [department] = await tx.select().from(departments).where(eq(departments.id, id)).for("update").limit(1);
    if (!department) throw new ServiceError("Department not found.", 404);
    const [members] = await tx.select({ total: count() }).from(employees).where(eq(employees.department, department.name));
    if (members.total > 0) throw new ServiceError("Reassign this department's employees before retiring it.", 409);
    return (await tx.update(departments).set({ active: false }).where(eq(departments.id, id)).returning())[0];
  });
}

export async function reactivateDepartment(id: string) {
  const updated = (await db.update(departments).set({ active: true }).where(eq(departments.id, id)).returning())[0];
  if (!updated) throw new ServiceError("Department not found.", 404);
  return updated;
}

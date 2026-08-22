import { date, index, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const employees = pgTable("employees", {
  id: uuid("id").defaultRandom().primaryKey(),
  employeeNumber: varchar("employee_number", { length: 24 }).notNull(),
  firstName: varchar("first_name", { length: 80 }).notNull(),
  lastName: varchar("last_name", { length: 80 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  jobTitle: varchar("job_title", { length: 120 }).notNull(),
  department: varchar("department", { length: 100 }).notNull(),
  location: varchar("location", { length: 120 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("active"),
  startDate: date("start_date").notNull(),
  manager: varchar("manager", { length: 160 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("employees_number_uq").on(table.employeeNumber),
  uniqueIndex("employees_email_uq").on(table.email),
  index("employees_department_idx").on(table.department),
  index("employees_status_idx").on(table.status),
]);

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;

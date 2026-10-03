import { bigint, boolean, date, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const departments = pgTable("departments", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employees = pgTable("employees", {
  id: uuid("id").defaultRandom().primaryKey(),
  employeeNumber: varchar("employee_number", { length: 24 }).notNull(),
  firstName: varchar("first_name", { length: 80 }).notNull(),
  lastName: varchar("last_name", { length: 80 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  company: varchar("company", { length: 160 }).notNull(),
  jobTitle: varchar("job_title", { length: 120 }).notNull(),
  department: varchar("department", { length: 100 }).notNull().references(() => departments.name, { onUpdate: "cascade", onDelete: "restrict" }),
  userId: text("user_id").unique().references(() => user.id, { onDelete: "set null" }),
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
  index("employees_name_id_idx").on(table.lastName, table.firstName, table.id),
]);

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;

export const timeAway = pgTable("time_away", {
  id: uuid("id").defaultRandom().primaryKey(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 24 }).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("confirmed"),
  note: varchar("note", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("time_away_employee_dates_idx").on(table.employeeId, table.startDate, table.endDate), index("time_away_status_dates_idx").on(table.status, table.startDate, table.endDate)]);

export const employeeHomeAddress = pgTable("employee_home_address", {
  employeeId: uuid("employee_id").primaryKey().references(() => employees.id, { onDelete: "cascade" }),
  line1: varchar("line1", { length: 160 }).notNull(),
  line2: varchar("line2", { length: 160 }),
  city: varchar("city", { length: 100 }).notNull(),
  region: varchar("region", { length: 100 }).notNull(),
  postalCode: varchar("postal_code", { length: 30 }).notNull(),
  country: varchar("country", { length: 100 }).notNull(),
  placeId: varchar("place_id", { length: 255 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const profilePhotos = pgTable("profile_photos", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  data: text("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userSignIns = pgTable("user_sign_ins", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  firstSignInAt: timestamp("first_sign_in_at", { withTimezone: true }).notNull(),
  lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }).notNull(),
});

export const userRoles = pgTable("user_roles", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 16 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.userId, table.role] }), index("user_roles_admin_idx").on(table.role, table.expiresAt)]);

export const roleAudit = pgTable("role_audit", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: text("actor_id").notNull(),
  targetUserId: text("target_user_id").notNull(),
  role: varchar("role", { length: 16 }).notNull(),
  action: varchar("action", { length: 16 }).notNull(),
  previousExpiresAt: timestamp("previous_expires_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("role_audit_target_idx").on(table.targetUserId, table.createdAt)]);

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (table) => [index("session_user_id_idx").on(table.userId)]);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("account_user_id_idx").on(table.userId),
  uniqueIndex("account_provider_account_uq").on(table.providerId, table.accountId),
]);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("verification_identifier_idx").on(table.identifier)]);

export const rateLimit = pgTable("rateLimit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const profileDocuments = pgTable("profile_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Keep the object reference after account deletion so cleanup can remove its bytes.
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  uploadKey: uuid("upload_key").notNull(),
  originalName: varchar("original_name", { length: 200 }).notNull(),
  category: varchar("category", { length: 16 }).$type<"resume" | "other">().notNull(),
  contentType: varchar("content_type", { length: 100 }).notNull(),
  byteSize: integer("byte_size").notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  bucket: text("bucket").notNull(),
  objectKey: text("object_key").notNull(),
  generation: text("generation"),
  status: varchar("status", { length: 16 }).$type<"pending" | "ready" | "deleting">().notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("profile_documents_upload_uq").on(table.userId, table.uploadKey),
  uniqueIndex("profile_documents_object_uq").on(table.bucket, table.objectKey),
  index("profile_documents_owner_created_idx").on(table.userId, table.createdAt),
  index("profile_documents_cleanup_idx").on(table.status, table.updatedAt),
]);

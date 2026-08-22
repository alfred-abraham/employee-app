CREATE TABLE "employees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employee_number" varchar(24) NOT NULL,
  "first_name" varchar(80) NOT NULL,
  "last_name" varchar(80) NOT NULL,
  "email" varchar(255) NOT NULL,
  "phone" varchar(40),
  "job_title" varchar(120) NOT NULL,
  "department" varchar(100) NOT NULL,
  "location" varchar(120) NOT NULL,
  "status" varchar(24) DEFAULT 'active' NOT NULL,
  "start_date" date NOT NULL,
  "manager" varchar(160),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employees_status_check" CHECK ("status" IN ('active', 'on_leave', 'inactive'))
);
CREATE UNIQUE INDEX "employees_number_uq" ON "employees" USING btree ("employee_number");
CREATE UNIQUE INDEX "employees_email_uq" ON "employees" USING btree ("email");
CREATE INDEX "employees_department_idx" ON "employees" USING btree ("department");
CREATE INDEX "employees_status_idx" ON "employees" USING btree ("status");

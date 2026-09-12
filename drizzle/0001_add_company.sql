ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "company" varchar(160);
UPDATE "employees" SET "company" = 'PeopleCore' WHERE "company" IS NULL;
ALTER TABLE "employees" ALTER COLUMN "company" SET NOT NULL;

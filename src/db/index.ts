import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };
const connectionString = process.env.DATABASE_URL ?? "postgresql://unconfigured:unconfigured@127.0.0.1:5432/unconfigured";
const socketPath = process.env.DATABASE_SOCKET_PATH;

const sql = globalForDb.sql ?? postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  ...(socketPath ? { host: socketPath } : {}),
});
if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

export const db = drizzle(sql, { schema });

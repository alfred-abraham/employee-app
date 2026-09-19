import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const socketPath = process.env.DATABASE_SOCKET_PATH;
  const sql = postgres(connectionString, { max: 1, ...(socketPath ? { host: socketPath } : {}) });
  try {
    await sql`create table if not exists app_migrations (name text primary key, applied_at timestamptz not null default now())`;
    for (const name of (await readdir("drizzle")).filter((file) => file.endsWith(".sql")).sort()) {
      if ((await sql`select 1 from app_migrations where name = ${name}`).length) continue;
      const migration = await readFile(join("drizzle", name), "utf8");
      await sql.begin(async (transaction) => { await transaction.unsafe(migration); await transaction`insert into app_migrations (name) values (${name})`; });
      console.log(`Applied ${name}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

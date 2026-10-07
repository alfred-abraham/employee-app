import postgres from "postgres";

async function main() {
  const email = process.argv[2]?.trim();
  if (!email || !process.env.DATABASE_URL) throw new Error("Usage: npm run admin:bootstrap -- <verified-account-email> (DATABASE_URL required)");
  const sql = postgres(process.env.DATABASE_URL, { max: 1, ...(process.env.DATABASE_SOCKET_PATH ? { host: process.env.DATABASE_SOCKET_PATH } : {}) });
  try {
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(741027)`;
      const [account] = await tx`select id from "user" where lower(email) = lower(${email}) and email_verified = true`;
      if (!account) throw new Error("A verified account with that email must already exist. Register and verify it first.");
      const [blocked] = await tx`select 1 from account_blocks where user_id = ${account.id} and (expires_at is null or expires_at > now())`;
      if (blocked) throw new Error("Unblock this account through an existing administrator before granting access.");
      const [previous] = await tx`select expires_at from user_roles where user_id = ${account.id} and role = 'admin'`;
      await tx`insert into user_roles (user_id, role, expires_at) values (${account.id}, 'admin', null)
        on conflict (user_id, role) do update set expires_at = null, updated_at = now()`;
      await tx`insert into role_audit (actor_id, target_user_id, role, action, previous_expires_at)
        values ('system:admin-bootstrap', ${account.id}, 'admin', 'bootstrap', ${previous?.expires_at ?? null})`;
    });
    console.log("Permanent administrator provisioned. Sign in and open /admin/users.");
  } finally { await sql.end(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Bootstrap failed."); process.exitCode = 1; });

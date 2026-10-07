import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { hashPassword } from "better-auth/crypto";

// Explicit opt-in: only a disposable PostgreSQL instance on localhost is accepted.
const databaseURL = process.env.ROLE_TEST_DATABASE_URL;
const baseURL = process.env.ROLE_TEST_BASE_URL;
test("roles: database migrations, admin bootstrap, API authorization, expiry, revocation, audit, and concurrent changes", { skip: !databaseURL || !baseURL, timeout: 120_000 }, async () => {
  const connection = new URL(databaseURL!);
  const base = new URL(baseURL!);
  assert.ok(["localhost", "127.0.0.1"].includes(connection.hostname));
  assert.equal(connection.username, "role_test");
  assert.equal(connection.pathname, "/postgres");
  assert.equal(connection.port, "55439", "Use the isolated role test instance, never the application database");
  assert.ok(["localhost", "127.0.0.1"].includes(base.hostname));
  assert.equal(base.port, "3107");
  const sql = postgres(databaseURL!, { max: 5, onnotice: () => {} });
  const password = "Role-Test-Pass9!";
  const prefix = `role-${Date.now()}`;
  const ids = { admin: `${prefix}-admin`, pending: `${prefix}-pending`, editor: `${prefix}-editor`, other: `${prefix}-other` };
  const email = (name: string) => `${prefix}-${name}@example.com`;
  const request = async (path: string, cookie = "", method = "GET", body?: object) => {
    return fetch(`${baseURL}${path}`, { method, headers: { cookie, origin: baseURL!, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  };
  const login = async (name: string) => {
    const response = await request("/api/auth/sign-in/email", "", "POST", { email: email(name), password });
    assert.equal(response.status, 200, await response.clone().text());
    return response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  };
  const role = async (cookie: string, target: string, selected: string, expiresAt: string | null = null, revoke = false) => {
    return request(`/api/admin/users/${target}/roles`, cookie, revoke ? "DELETE" : "PUT", revoke ? { role: selected } : { role: selected, expiresAt });
  };
  try {
    const [existingAdmins] = await sql`select count(*)::int as total from user_roles where role = 'admin' and expires_at is null`;
    assert.equal(existingAdmins.total, 0, "Use a fresh disposable database with no permanent admin fixtures");
    await sql`delete from "rateLimit"`;
    const hashed = await hashPassword(password);
    for (const [name, id] of Object.entries(ids)) {
      await sql`insert into "user" (id, name, email, email_verified) values (${id}, ${`Role Test ${name}`}, ${email(name)}, true)`;
      await sql`insert into account (id, account_id, provider_id, user_id, password) values (${id}, ${id}, 'credential', ${id}, ${hashed})`;
    }
    const bootstrap = (name: string) => execFileSync(process.execPath, ["--import", "tsx", "scripts/admin-bootstrap.ts", email(name)], {
      env: { ...process.env, DATABASE_URL: databaseURL!, DATABASE_SOCKET_PATH: "" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
    assert.match(bootstrap("admin"), /Permanent administrator provisioned/);
    const admin = await login("admin");
    const pending = await login("pending");
    const editor = await login("editor");
    await login("pending"); // second successful session must not duplicate the user
    assert.equal((await request("/api/employees")).status, 401);
    assert.equal((await request("/api/admin/users")).status, 401);
    assert.equal((await request("/api/employees", pending)).status, 403);
    assert.equal((await request("/api/departments", pending)).status, 403);
    assert.equal((await request("/api/time-away", pending)).status, 403);
    assert.equal((await request("/api/admin/users", pending)).status, 403);
    assert.equal((await role(pending, ids.pending, "admin")).status, 403);
    assert.equal((await request("/api/me/address", pending)).status, 200);
    const pendingPage = await request("/", pending);
    assert.equal(pendingPage.status, 307);
    assert.match(pendingPage.headers.get("location") ?? "", /access-pending/);
    const [signIn] = await sql`select * from user_sign_ins where user_id = ${ids.pending}`;
    assert.ok(signIn.first_sign_in_at <= signIn.last_sign_in_at);
    const list = await (await request(`/api/admin/users?search=${encodeURIComponent(email("pending"))}`, admin)).json();
    assert.equal(list.users.length, 1);
    assert.equal(list.users[0].status, "pending");
    assert.ok(list.users[0].firstSignInAt);
    assert.equal((await role(admin, ids.pending, "owner")).status, 400);
    assert.equal((await role(admin, ids.pending, "viewer", "2020-01-01T00:00:00Z")).status, 400);
    assert.equal((await role(admin, "unknown-account", "viewer")).status, 404);
    assert.equal((await role(admin, ids.pending, "viewer")).status, 200);
    assert.equal((await request("/api/employees", pending)).status, 200);
    assert.equal((await request("/api/employees", pending, "POST", {})).status, 403);
    assert.equal((await request("/api/departments", pending, "POST", {})).status, 403);
    assert.equal((await request("/api/time-away", pending, "POST", {})).status, 403);
    assert.equal((await request(`/api/employees/00000000-0000-4000-8000-000000000001`, pending, "DELETE")).status, 403);
    assert.equal((await request("/api/admin/users", pending)).status, 403);
    assert.equal((await role(admin, ids.editor, "editor")).status, 200);
    assert.equal((await request("/api/admin/users", editor)).status, 403);
    assert.equal((await role(editor, ids.editor, "admin")).status, 403);
    const deptResponse = await request("/api/departments", admin, "POST", { name: `${prefix} department` });
    assert.equal(deptResponse.status, 201);
    const department = (await deptResponse.json()).department;
    const employeeResponse = await request("/api/employees", editor, "POST", {
      employeeNumber: prefix.slice(-20), firstName: "Role", lastName: "Test", email: email("editor"), company: "Testing",
      jobTitle: "Tester", department: department.name, location: "Remote", status: "active", startDate: "2026-10-03", phone: "", manager: "",
    });
    assert.equal(employeeResponse.status, 201, await employeeResponse.clone().text());
    const employee = (await employeeResponse.json()).employee;
    assert.equal((await request(`/api/employees/${employee.id}`, editor, "PATCH", { jobTitle: "Updated Tester" })).status, 200);
    assert.equal((await request(`/api/employees/${employee.id}`, editor, "DELETE")).status, 403);
    assert.equal((await request(`/api/employees/${employee.id}`, admin, "DELETE")).status, 204);
    // Expired elevated access does not remove a permanent viewer role.
    assert.equal((await role(admin, ids.pending, "editor", new Date(Date.now() + 60_000).toISOString())).status, 200);
    assert.equal((await role(admin, ids.pending, "editor", new Date(Date.now() + 120_000).toISOString())).status, 200);
    await sql`update user_roles set expires_at = now() where user_id = ${ids.pending} and role = 'editor'`;
    assert.equal((await request("/api/employees", pending)).status, 200);
    assert.equal((await request("/api/employees", pending, "POST", {})).status, 403);
    assert.equal((await role(admin, ids.pending, "viewer", null, true)).status, 200);
    assert.equal((await request("/api/employees", pending)).status, 403);
    assert.equal((await role(admin, ids.editor, "editor", null, true)).status, 200);
    assert.equal((await request("/api/employees", editor)).status, 403);
    // A failed last-admin change must roll back both assignment and audit.
    assert.equal((await role(admin, ids.admin, "admin", null, true)).status, 409);
    assert.equal((await role(admin, ids.admin, "admin", new Date(Date.now() + 60_000).toISOString())).status, 409);
    const [permanent] = await sql`select expires_at from user_roles where user_id = ${ids.admin} and role = 'admin'`;
    assert.equal(permanent.expires_at, null);
    assert.equal((await role(admin, ids.other, "admin")).status, 200);
    const results = await Promise.all([role(admin, ids.admin, "admin", null, true), role(admin, ids.other, "admin", null, true)]);
    const statuses = results.map((response) => response.status);
    assert.equal(statuses.filter((status) => status === 200).length, 1);
    assert.ok(statuses.some((status) => status === 403 || status === 409));
    const permanentAdmins = await sql`select * from user_roles where role = 'admin' and expires_at is null`;
    assert.equal(permanentAdmins.length, 1);
    assert.equal((await request("/api/admin/users", admin)).status, permanentAdmins[0].user_id === ids.admin ? 200 : 403);
    assert.match(bootstrap("admin"), /Permanent administrator provisioned/); // operator recovery
    await sql`update "user" set email_verified = false where id = ${ids.editor}`;
    assert.throws(() => bootstrap("editor"), /verified account/);
    const audit = await sql`select * from role_audit where target_user_id like ${`${prefix}%`}`;
    assert.ok(audit.some((entry) => entry.action === "bootstrap" && entry.actor_id === "system:admin-bootstrap"));
    assert.ok(audit.some((entry) => entry.action === "grant"));
    assert.ok(audit.some((entry) => entry.action === "revoke"));
    assert.ok(audit.some((entry) => entry.action === "change" && entry.previous_expires_at && entry.expires_at > entry.previous_expires_at));
    assert.ok(audit.every((entry) => entry.created_at));
    // Verify historical-session migration and duplicate sign-in backfill in a separate schema.
    await sql.begin(async (tx) => {
      await tx`create schema role_backfill_test`;
      await tx`set local search_path to role_backfill_test`;
      await tx`create table "user" (id text primary key)`;
      await tx`create table session (user_id text, created_at timestamptz)`;
      await tx`insert into "user" values ('history')`;
      await tx`insert into session values ('history', '2026-01-01T00:00:00Z'), ('history', '2026-09-01T00:00:00Z')`;
      await tx.unsafe(await readFile("drizzle/0005_user_roles.sql", "utf8"));
      const [history] = await tx`select * from user_sign_ins`;
      assert.equal(history.first_sign_in_at.toISOString(), "2026-01-01T00:00:00.000Z");
      assert.equal(history.last_sign_in_at.toISOString(), "2026-09-01T00:00:00.000Z");
      await tx`drop schema role_backfill_test cascade`;
    });
  } finally {
    await sql`delete from "user" where id = any(${Object.values(ids)})`;
    await sql.end();
  }
});

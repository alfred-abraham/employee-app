import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { hashPassword } from "better-auth/crypto";

const databaseURL = process.env.ROLE_TEST_DATABASE_URL;
const baseURL = process.env.ROLE_TEST_BASE_URL;
test("employee ownership: API authorization, claims, migration, spoofing, and concurrent creation", { skip: !databaseURL || !baseURL, timeout: 120_000 }, async () => {
  const connection = new URL(databaseURL!), base = new URL(baseURL!);
  assert.ok(["127.0.0.1", "localhost"].includes(connection.hostname));
  assert.equal(connection.username, "role_test"); assert.equal(connection.port, "55439"); assert.equal(connection.pathname, "/postgres");
  assert.ok(["127.0.0.1", "localhost"].includes(base.hostname)); assert.equal(base.port, "3107");
  const sql = postgres(databaseURL!, { max: 5, onnotice() {} });
  const prefix = `own-${Date.now()}`;
  const names = ["admin", "editor", "second", "viewer", "pending", "expired", "blocked", "legacy", "ambiguous", "collision"];
  const id = (name: string) => `${prefix}-${name}`, email = (name: string) => `${id(name)}@example.com`;
  const request = (path: string, cookie = "", method = "GET", body?: object) => fetch(`${baseURL}${path}`, {
    method, headers: { cookie, origin: baseURL!, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, redirect: "manual",
  });
  const cookies: Record<string, string> = {};
  let departmentId = "";
  const record = (name: string, extra = {}) => ({ employeeNumber: id(name).slice(-24), firstName: "Own", lastName: name, email: email(name), company: "Testing", jobTitle: "Tester", department: prefix, location: "Remote", status: "active", startDate: "2026-10-07", ...extra });
  try {
    await sql`delete from "rateLimit"`;
    const password = "Ownership-Test-Pass9!", hashed = await hashPassword(password);
    for (const name of names) {
      await sql`insert into "user" (id,name,email,email_verified) values (${id(name)},${name},${email(name)},true)`;
      await sql`insert into account (id,account_id,provider_id,user_id,password) values (${id(name)},${id(name)},'credential',${id(name)},${hashed})`;
      if (name !== "pending") await sql`insert into user_roles (user_id,role,expires_at) values (${id(name)},${name === "admin" ? "admin" : name === "viewer" ? "viewer" : "editor"},${name === "expired" ? new Date(0) : null})`;
      // Fixture provisioning must not exercise the production sign-in rate limit.
      await sql`delete from "rateLimit"`;
      const login = await request("/api/auth/sign-in/email", "", "POST", { email: email(name), password });
      assert.equal(login.status, 200, await login.clone().text());
      cookies[name] = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    }
    await sql`insert into account_blocks (user_id,actor_id,reason) values (${id("blocked")},${id("admin")},'test')`;
    const department = await request("/api/departments", cookies.admin, "POST", { name: prefix }); assert.equal(department.status, 201);
    departmentId = (await department.json()).department.id;
    assert.equal((await request("/api/employees", "", "POST", record("editor"))).status, 401);
    for (const name of ["viewer", "pending", "expired", "blocked"]) {
      const expected = name === "blocked" ? 401 : 403;
      assert.equal((await request("/api/employees", cookies[name], "POST", record(name))).status, expected);
    }
    assert.equal((await request("/api/employees", cookies.editor, "POST", record("second"))).status, 403);
    assert.equal((await request("/api/employees", cookies.editor, "POST", record("editor", { userId: id("second") }))).status, 400);
    const concurrent = await Promise.all([0, 1].map(() => request("/api/employees", cookies.editor, "POST", record("editor"))));
    assert.deepEqual(concurrent.map(response => response.status).sort(), [201, 409]);
    const ownedId = (await concurrent.find(response => response.status === 201)!.json()).employee.id;
    const [stored] = await sql`select * from employees where id = ${ownedId}`; assert.equal(stored.user_id, id("editor"));
    const second = await request("/api/employees", cookies.second, "POST", record("second")); assert.equal(second.status, 201);
    const secondId = (await second.json()).employee.id;
    assert.equal((await request(`/api/employees/${ownedId}`, cookies.editor, "PATCH", { jobTitle: "Updated" })).status, 200);
    assert.equal((await request(`/api/employees/${secondId}`, cookies.editor, "PATCH", { jobTitle: "Stolen" })).status, 403);
    assert.equal((await request(`/api/employees/${ownedId}`, cookies.editor, "PATCH", { email: email("second") })).status, 403);
    for (const payload of [{ userId: id("second") }, { id: secondId }, { role: "admin" }]) assert.equal((await request(`/api/employees/${ownedId}`, cookies.editor, "PATCH", payload)).status, 400);
    const [unchanged] = await sql`select job_title,user_id from employees where id = ${secondId}`;
    assert.equal(unchanged.job_title, "Tester"); assert.equal(unchanged.user_id, id("second"));
    const grants = await sql`select role from user_roles where user_id = ${id("editor")}`; assert.deepEqual(grants.map(row => row.role), ["editor"]);
    await sql`update "user" set email_verified = false where id = ${id("editor")}`;
    assert.equal((await request(`/api/employees/${ownedId}`, cookies.editor, "PATCH", { company: "Unverified" })).status, 403);
    await sql`update "user" set email_verified = true where id = ${id("editor")}`;
    for (const target of [ownedId, secondId]) assert.equal((await request(`/api/employees/${target}`, cookies.editor, "DELETE")).status, 403);
    for (const name of ["viewer", "pending", "expired", "blocked"]) {
      for (const method of ["PATCH", "DELETE"]) assert.equal((await request(`/api/employees/${ownedId}`, cookies[name], method, method === "PATCH" ? { jobTitle: "Denied" } : undefined)).status, name === "blocked" ? 401 : 403);
    }
    assert.equal((await request("/api/departments", cookies.editor, "POST", { name: `${prefix}-bad` })).status, 403);
    assert.equal((await request(`/api/departments/${departmentId}`, cookies.editor, "PATCH", { name: "Bad" })).status, 403);
    assert.equal((await request(`/api/departments/${departmentId}`, cookies.editor, "PATCH", { active: false })).status, 403);
    const away = { employeeId: ownedId, type: "vacation", startDate: "2026-10-07", endDate: "2026-10-08", note: "Test" };
    assert.equal((await request("/api/time-away", cookies.editor, "POST", away)).status, 403);
    const adminAway = await request("/api/time-away", cookies.admin, "POST", away); assert.equal(adminAway.status, 201);
    const awayId = (await adminAway.json()).entry.id;
    assert.equal((await request(`/api/time-away/${awayId}`, cookies.editor, "PATCH", away)).status, 403);
    assert.equal((await request(`/api/time-away/${awayId}`, cookies.editor, "DELETE")).status, 403);
    assert.equal((await request(`/api/time-away/${awayId}`, cookies.admin, "DELETE")).status, 200);
    assert.equal((await request(`/api/employees/${secondId}`, cookies.admin, "PATCH", { jobTitle: "Admin updated" })).status, 200);
    const adminCreated = await request("/api/employees", cookies.admin, "POST", record("legacy", { email: email("legacy").toUpperCase() })); assert.equal(adminCreated.status, 201);
    const legacyId = (await adminCreated.json()).employee.id;
    assert.equal((await request(`/api/employees/${legacyId}`, cookies.legacy, "PATCH", { company: "Claimed" })).status, 200);
    const [legacy] = await sql`select user_id from employees where id = ${legacyId}`; assert.equal(legacy.user_id, id("legacy"));
    const filtered = await (await request(`/api/employees?search=no-such-record`, cookies.editor)).json();
    assert.equal(filtered.employees.length, 0); assert.equal(filtered.ownEmployee.id, ownedId); assert.equal("userId" in filtered.ownEmployee, false);
    // Case variants in the account table are ambiguous and must never be guessed.
    await sql`insert into "user" (id,name,email,email_verified) values (${id("case")},'Case',${email("ambiguous").toUpperCase()},true)`;
    assert.equal((await request("/api/employees", cookies.ambiguous, "POST", record("ambiguous"))).status, 409);
    const conflict = await (await request("/api/employees", cookies.ambiguous)).json(); assert.ok(conflict.ownershipError); assert.equal(conflict.ownEmployee, null);
    // Another account already owns a matching email: never reassign it.
    await sql`update employees set email = ${email("collision")} where id = ${secondId}`;
    assert.equal((await request("/api/employees", cookies.collision, "POST", record("collision"))).status, 409);
    assert.equal((await request(`/api/employees/${secondId}`, cookies.collision, "PATCH", { company: "Steal" })).status, 409);
    assert.equal((await request("/api/me/address", cookies.collision)).status, 409);
    // Personal address remains separate self-service; profile ownership never changes.
    assert.equal((await request("/api/me/address", cookies.editor, "PATCH", { line1: "123 Main St", city: "Phoenix", region: "AZ", postalCode: "85001", country: "US" })).status, 200);
    assert.equal((await request(`/api/employees/${ownedId}`, cookies.admin, "DELETE")).status, 204);
    await sql.begin(async tx => {
      await tx`create schema ownership_backfill_test`; await tx`set local search_path to ownership_backfill_test`;
      await tx`create table "user" (id text primary key,email text,email_verified boolean)`;
      await tx`create table employees (id text primary key,email text,user_id text unique)`;
      await tx`insert into "user" values ('safe','safe@example.com',true),('a','same@example.com',true),('b','SAME@example.com',true),('existing','existing@example.com',true),('unverified','unverified@example.com',false)`;
      await tx`insert into employees values ('safe',' SAFE@example.com ',null),('ambiguous','same@example.com',null),('linked','changed@example.com','existing'),('extra','existing@example.com',null),('unverified','unverified@example.com',null),('d1','duplicate@example.com',null),('d2','DUPLICATE@example.com',null)`;
      await tx`insert into "user" values ('duplicate','duplicate@example.com',true)`;
      const before = await tx`select id,email from employees order by id`;
      await tx.unsafe(await readFile("drizzle/0008_employee_ownership.sql", "utf8"));
      assert.deepEqual(await tx`select id,email from employees order by id`, before);
      const associations = await tx`select id,user_id from employees where user_id is not null order by id`;
      assert.deepEqual(associations.map(row => [row.id,row.user_id]), [["linked","existing"],["safe","safe"]]);
      await tx`drop schema ownership_backfill_test cascade`;
    });
  } finally {
    await sql`delete from employees where department = ${prefix}`;
    await sql`delete from departments where name = ${prefix}`;
    await sql`delete from "user" where id like ${`${prefix}%`}`;
    await sql.end();
  }
});

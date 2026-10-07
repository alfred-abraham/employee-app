import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { hashPassword } from "better-auth/crypto";
import { execFileSync } from "node:child_process";

const databaseURL = process.env.BLOCK_TEST_DATABASE_URL, origin = process.env.BLOCK_TEST_BASE_URL;
test("account blocking: real SQL, sessions, admin safeguards, profile access, expiry, audit and concurrency", { skip: !databaseURL || !origin, timeout: 180_000 }, async () => {
  const url = new URL(databaseURL!); assert.ok(["localhost", "127.0.0.1"].includes(url.hostname)); assert.equal(url.port, "55439"); assert.equal(url.username, "role_test"); assert.equal(url.pathname, "/postgres");
  const base = new URL(origin!); assert.ok(["localhost", "127.0.0.1"].includes(base.hostname)); assert.equal(base.port, "3107");
  const sql = postgres(databaseURL!, { max: 5 }), prefix = `block-${Date.now()}`;
  const ids = { admin: `${prefix}-admin`, second: `${prefix}-second`, pending: `${prefix}-pending`, viewer: `${prefix}-viewer`, editor: `${prefix}-editor` };
  const password = "Block-Test-Pass9!", email = (name: string) => `${prefix}-${name}@example.invalid`;
  const call = (path: string, cookie = "", method = "GET", body?: object) => fetch(origin + path, { method, headers: { cookie, origin: origin!, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const login = async (name: string) => {
    await sql`delete from "rateLimit"`;
    const response = await call("/api/auth/sign-in/email", "", "POST", { email: email(name), password });
    assert.equal(response.status, 200, await response.clone().text());
    return response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ");
  };
  const block = (cookie: string, name: keyof typeof ids, unblock = false, expiry: string | null = null) => call(`/api/admin/users/${ids[name]}/block`, cookie, unblock ? "DELETE" : "PUT", unblock ? { reason: "Reviewed and reinstated" } : { reason: "Internal abuse investigation", expiresAt: expiry });
  try {
    const hashed = await hashPassword(password);
    for (const [name, id] of Object.entries(ids)) {
      await sql`insert into "user" (id,name,email,email_verified) values (${id},${name},${email(name)},true)`;
      await sql`insert into account (id,account_id,provider_id,user_id,password) values (${id},${id},'credential',${id},${hashed})`;
    }
    for (const [name, role] of [["admin", "admin"], ["viewer", "viewer"], ["editor", "editor"]]) await sql`insert into user_roles (user_id,role) values (${ids[name as keyof typeof ids]},${role})`;
    const admin = await login("admin"), viewer = await login("viewer"), editor = await login("editor"), pending = await login("pending");
    const [originalSession] = await sql`select * from session where user_id=${ids.viewer}`;
    assert.equal((await block("", "pending")).status, 401);
    for (const cookie of [viewer, editor, pending]) for (const unblock of [false, true]) assert.equal((await block(cookie, "pending", unblock)).status, 403);
    assert.equal((await block(admin, "admin")).status, 409);
    assert.equal((await block(admin, "viewer", false, "2020-01-01T00:00:00Z")).status, 400);
    const before = await sql`select * from "user" where id=${ids.viewer}`;
    assert.equal((await block(admin, "viewer")).status, 200);
    assert.equal((await sql`select id from session where user_id=${ids.viewer}`).length, 0);
    for (const path of ["/api/employees", "/api/admin/users", "/api/me/address", "/api/me/photo", "/api/me/documents"]) assert.equal((await call(path, viewer)).status, 401, path);
    for (const path of ["/", "/admin/users", "/my-address", "/my-documents", "/access-pending"]) assert.equal((await call(path, viewer)).status, 307, path);
    await sql`delete from "rateLimit"`;
    const denied = await call("/api/auth/sign-in/email", "", "POST", { email: email("viewer"), password });
    assert.equal(denied.status, 401); assert.doesNotMatch(await denied.text(), /Internal abuse investigation/);
    const signup = await call("/api/auth/sign-up/email", "", "POST", { email: email("viewer").toUpperCase(), password, name: "Bypass" });
    assert.equal(signup.status, 200, "registration must keep its normal enumeration-safe response");
    assert.equal((await signup.json()).token, null);
    assert.equal((await sql`select * from "user" where id=${ids.viewer}`)[0].name, before[0].name);
    assert.equal((await sql`select * from user_roles where user_id=${ids.viewer}`).length, 1);
    // Even a session created out of band is denied on all shared session helpers.
    await sql`insert into session(id,token,user_id,expires_at) values (${originalSession.id},${originalSession.token},${ids.viewer},now()+interval '1 hour')`;
    for (const path of ["/api/employees", "/api/me/address", "/api/me/documents"]) assert.equal((await call(path, viewer)).status, 401, "a valid signed cookie cannot bypass a block: " + path);
    assert.equal((await block(admin, "viewer", true)).status, 200);
    assert.equal((await sql`select id from session where user_id=${ids.viewer}`).length, 0);
    assert.equal((await call("/api/employees", viewer)).status, 401);
    const fresh = await login("viewer"); assert.equal((await call("/api/employees", fresh)).status, 200);
    assert.equal((await block(admin, "viewer", false, new Date(Date.now()+60_000).toISOString())).status, 200);
    await sql`update account_blocks set expires_at=now() where user_id=${ids.viewer}`;
    assert.equal((await call("/api/employees", fresh)).status, 401);
    const expiredFresh = await login("viewer"); assert.equal((await call("/api/employees", expiredFresh)).status, 200);
    assert.equal((await block(admin, "pending")).status, 200); assert.equal((await block(admin, "pending", true)).status, 200);
    const pendingFresh = await login("pending"); assert.equal((await call("/api/employees", pendingFresh)).status, 403);
    // A blocked administrator cannot act or count toward the permanent-admin invariant.
    await sql`insert into user_roles(user_id,role) values (${ids.second},'admin')`;
    const second = await login("second");
    await sql`update user_roles set expires_at=now()+interval '1 hour' where user_id=${ids.second}`;
    assert.equal((await block(second, "admin")).status, 409, "a temporary admin cannot block the last permanent admin");
    await sql`update user_roles set expires_at=null where user_id=${ids.second}`;
    assert.equal((await block(admin, "second")).status, 200);
    assert.throws(() => execFileSync(process.execPath, ["--import", "tsx", "scripts/admin-bootstrap.ts", email("second")], {
      env: { ...process.env, DATABASE_URL: databaseURL!, DATABASE_SOCKET_PATH: "" }, stdio: ["ignore", "pipe", "pipe"],
    }), /Unblock/, "operator bootstrap must not bypass an active block");
    assert.equal((await block(second, "editor")).status, 401);
    assert.equal((await call(`/api/admin/users/${ids.admin}/roles`, admin, "DELETE", { role: "admin" })).status, 409);
    assert.equal((await block(admin, "second", true)).status, 200);
    const secondFresh = await login("second");
    const results = await Promise.all([block(admin, "second"), block(secondFresh, "admin")]);
    assert.equal(results.filter(response => response.status === 200).length, 1);
    assert.ok(results.some(response => [401,403,409].includes(response.status)));
    const remaining = await sql`select r.user_id from user_roles r left join account_blocks b on b.user_id=r.user_id where r.role='admin' and r.expires_at is null and (b.user_id is null or b.expires_at<=now())`;
    assert.equal(remaining.length, 1);
    const currentName = remaining[0].user_id === ids.admin ? "admin" : "second";
    const current = await login(currentName);
    const listed = await (await call(`/api/admin/users?search=${prefix}`, current)).json();
    assert.ok(listed.users.some((account: {status:string}) => account.status === "blocked"));
    // Cross-operation races share the same lock: either block or role removal wins,
    // and the other administrator loses the authority required to complete its change.
    const otherName = currentName === "admin" ? "second" : "admin";
    assert.equal((await block(current, otherName, true)).status, 200);
    const otherCookie = await login(otherName);
    const mixed = await Promise.all([block(current, otherName), call(`/api/admin/users/${ids[currentName]}/roles`, otherCookie, "DELETE", { role: "admin" })]);
    assert.equal(mixed.filter(response => response.status === 200).length, 1);
    assert.ok(mixed.some(response => [401,403,409].includes(response.status)));
    const audit = await sql`select * from account_block_audit where target_user_id like ${prefix+'%'}`;
    assert.ok(audit.some(row => row.action === "block")); assert.ok(audit.some(row => row.action === "unblock"));
    assert.ok(audit.every(row => row.reason && row.actor_id && row.created_at));
  } finally { await sql`delete from "user" where id in ${sql(Object.values(ids))}`; await sql`delete from account_block_audit where target_user_id like ${prefix+'%'}`; await sql.end(); }
});

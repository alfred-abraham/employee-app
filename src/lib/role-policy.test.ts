import assert from "node:assert/strict";
import test from "node:test";
import { accessStatus, activeRoles, hasPermanentAdmin, permits, roleInput } from "./role-policy";

const now = new Date("2026-10-03T12:00:00Z");
test("viewer reads, editor manages records, admin manages access", () => {
  for (const [role, expected] of [["viewer", [true, false, false]], ["editor", [true, true, false]], ["admin", [true, true, true]]] as const) {
    assert.deepEqual(["read", "write", "admin"].map((permission) => permits([role], permission as "read" | "write" | "admin")), expected);
  }
  assert.equal(permits([], "read"), false);
});
test("expiry is exclusive and a separate unexpired grant survives", () => {
  const grants = [{ role: "admin", expiresAt: now }, { role: "viewer", expiresAt: null }, { role: "editor", expiresAt: "2026-10-03T12:00:01Z" }];
  assert.deepEqual(activeRoles(grants, now), ["viewer", "editor"]);
  assert.deepEqual(activeRoles(grants, new Date(now.getTime() + 1000)), ["viewer"]);
  assert.equal(accessStatus([{ role: "viewer", expiresAt: now }], now), "expired");
  assert.equal(accessStatus([], now), "pending");
  assert.equal(accessStatus(grants, now), "active");
  assert.deepEqual(activeRoles([{ role: "owner", expiresAt: null }, { role: "viewer", expiresAt: "invalid" }], now), []);
});
test("validate roles and explicit timezone expiry values", () => {
  const input = roleInput(now);
  assert.equal(input.safeParse({ role: "editor", expiresAt: null }).success, true);
  assert.deepEqual(input.parse({ role: "viewer" }), { role: "viewer", expiresAt: null });
  assert.equal(input.safeParse({ role: "admin", expiresAt: "2026-10-04T05:00:00-07:00" }).success, true);
  for (const value of ["2026-10-03T12:00:00Z", "2026-10-03T11:59:59Z", "2026-10-04T12:00", "invalid", ""]) {
    assert.equal(input.safeParse({ role: "admin", expiresAt: value }).success, false);
  }
  assert.equal(input.safeParse({ role: "owner", expiresAt: null }).success, false);
  assert.equal(input.safeParse({ role: "viewer", expiresAt: null, userId: "someone" }).success, false);
});
test("retain a permanent administrator to survive future expiries", () => {
  assert.equal(hasPermanentAdmin([{ role: "admin", expiresAt: "2099-01-01T00:00:00Z" }]), false);
  assert.equal(hasPermanentAdmin([{ role: "viewer", expiresAt: null }]), false);
  assert.equal(hasPermanentAdmin([{ role: "admin", expiresAt: null }]), true);
});

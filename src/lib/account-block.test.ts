import assert from "node:assert/strict";
import test from "node:test";
import { betterAuth } from "better-auth/minimal";
import { accountBlockHooks } from "./account-block-auth";
import { blockInput, isBlockActive } from "./account-block-policy";

test("blocks use exclusive UTC expiry and validate internal reasons and future dates", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  assert.equal(isBlockActive(null, now), false);
  assert.equal(isBlockActive({ expiresAt: null }, now), true);
  assert.equal(isBlockActive({ expiresAt: "2026-10-06T12:00:00Z" }, now), false);
  assert.equal(isBlockActive({ expiresAt: "2026-10-06T08:00:01-04:00" }, now), true);
  assert.equal(blockInput(now).safeParse({ reason: "   " }).success, false);
  assert.equal(blockInput(now).safeParse({ reason: "Abuse", expiresAt: now.toISOString() }).success, false);
  assert.deepEqual(blockInput(now).parse({ reason: "  Abuse  " }), { reason: "Abuse", expiresAt: null });
});

test("shared session hooks deny password and Google sign-in, normalized-email recreation, and raced session creation", async () => {
  const blocked = new Set<string>();
  const checkedIds: string[] = [];
  let denyCreated = false;
  let resetURL = "";
  let verificationURL = "";
  const hooks = accountBlockHooks(async id => { checkedIds.push(id); return blocked.has(id); }, async email => email.trim().toLowerCase() === "blocked@example.com", async () => !denyCreated);
  const auth = betterAuth({ baseURL: "http://localhost:3000", secret: "a-long-test-secret-for-account-blocks-only", rateLimit: { enabled: false },
    emailAndPassword: { enabled: true, sendResetPassword: async ({ url }) => { resetURL = url; } }, databaseHooks: hooks, socialProviders: { google: { clientId: "test", clientSecret: "test" } },
    account: { accountLinking: { enabled: true, requireLocalEmailVerified: false } },
    emailVerification: { autoSignInAfterVerification: false, sendVerificationEmail: async ({ url }) => { verificationURL = url; } },
  });
  const call = (path: string, body: object) => auth.handler(new Request(`http://localhost:3000/api/auth/${path}`, { method: "POST", headers: { origin: "http://localhost:3000", "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const email = "normal@example.com", password = "Block-Test-Pass9!";
  const signup = await call("sign-up/email", { email, password, name: "Test" });
  assert.equal(signup.status, 200);
  const { user } = await signup.json();
  blocked.add(user.id);
  const denied = await call("sign-in/email", { email, password });
  assert.equal(denied.status, 401);
  assert.equal((await denied.json()).code, "INVALID_EMAIL_OR_PASSWORD");
  assert.equal((await call("request-password-reset", { email, redirectTo: "/" })).status, 200);
  const token = new URL(resetURL).pathname.split("/").at(-1)!;
  assert.equal((await call("reset-password", { token, newPassword: password })).status, 200);
  assert.equal((await call("sign-in/email", { email, password })).status, 401, "password reset must not clear a block");
  assert.equal((await call("send-verification-email", { email, callbackURL: "/" })).status, 200);
  assert.equal((await auth.handler(new Request(verificationURL))).status, 302);
  assert.equal((await call("sign-in/email", { email, password })).status, 401, "email verification must not clear a block");
  const context = await auth.$context;
  const provider = context.socialProviders.find(provider => provider.id === "google")!;
  // Replace only the provider boundary in this test; exercise Better Auth's real OAuth flow and hooks.
  provider.options!.verifyIdToken = async () => true;
  provider.getUserInfo = async () => ({ user: { name: "Test", email, emailVerified: true }, data: { sub: "google-subject" } });
  checkedIds.length = 0;
  const google = await call("sign-in/social", { provider: "google", idToken: { token: "test-token" } });
  assert.equal(google.status, 401);
  assert.ok(checkedIds.includes(user.id), "OAuth must actually reach the account block hook");
  assert.equal(google.headers.getSetCookie().some(cookie => cookie.includes("session_token=")), false);
  const recreate = await call("sign-up/email", { email: "BLOCKED@example.com", password, name: "Recreated" });
  assert.equal(recreate.status, 403);
  provider.getUserInfo = async () => ({ user: { name: "Test", email: "BLOCKED@example.com", emailVerified: true }, data: { sub: "another-google-subject" } });
  const recreatedGoogle = await call("sign-in/social", { provider: "google", idToken: { token: "test-token" } });
  assert.equal(recreatedGoogle.status, 403);
  assert.equal((await recreatedGoogle.json()).code, "ACCOUNT_CREATION_UNAVAILABLE");
  blocked.delete(user.id);
  denyCreated = true;
  assert.equal((await call("sign-in/email", { email, password })).status, 401);
  denyCreated = false;
  assert.equal((await call("sign-in/email", { email, password })).status, 200);
});

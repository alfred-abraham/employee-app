import assert from "node:assert/strict";
import test from "node:test";
import { betterAuth } from "better-auth/minimal";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { createAuthMiddleware } from "better-auth/api";

test("Better Auth stores salted one-way password hashes", async () => {
  const password = "Useful-Pass9!";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword({ hash: first, password }), true);
  assert.equal(await verifyPassword({ hash: first, password: "Other-Pass9!" }), false);
});

test("email/password sign-in waits for verification", async () => {
  const messages: Array<{ url: string; token: string }> = [];
  const visitedPaths: string[] = [];
  let verificationRequestToken: string | null = null;
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "a-long-test-secret-that-is-not-used-in-production",
    emailAndPassword: { enabled: true, requireEmailVerification: true, autoSignIn: false },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      async sendVerificationEmail({ url, token }) { messages.push({ url, token }); },
      async beforeEmailVerification(_user, request) {
        verificationRequestToken = request ? new URL(request.url).searchParams.get("token") : null;
      },
    },
    hooks: { before: createAuthMiddleware(async (context) => { visitedPaths.push(context.path); }) },
    rateLimit: { enabled: false },
  });
  const request = (path: string, body: object) => auth.handler(new Request(`http://localhost:3000/api/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  }));
  const email = "registration-test@example.com";
  const password = "Useful-Pass9!";
  const signUp = await request("sign-up/email", { name: "Registration Test", email, password, callbackURL: "/login?verified=1&callbackURL=%2F" });
  assert.equal(signUp.status, 200);
  assert.equal(messages.length, 1);
  const context = await auth.$context;
  const accounts = await context.adapter.findMany<{ password: string }>({ model: "account" });
  assert.equal(accounts.length, 1);
  assert.notEqual(accounts[0].password, password);
  assert.equal(await verifyPassword({ hash: accounts[0].password, password }), true);

  const unknownResend = await request("send-verification-email", { email: "missing@example.com" });
  assert.equal(unknownResend.status, 200);
  assert.equal(messages.length, 1);
  const resend = await request("send-verification-email", { email });
  assert.equal(resend.status, 200);
  assert.equal(messages.length, 2);

  const before = await request("sign-in/email", { email, password });
  assert.equal(before.status, 403);
  assert.equal((await before.json()).code, "EMAIL_NOT_VERIFIED");

  const verification = await auth.handler(new Request(messages[1].url));
  assert.equal(verification.status, 302);
  assert.ok(visitedPaths.includes("/verify-email"));
  assert.equal(verificationRequestToken, messages[1].token);
  const after = await request("sign-in/email", { email, password });
  assert.equal(after.status, 200);
});

test("verification links expire", async () => {
  let verificationUrl = "";
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "a-long-test-secret-that-is-not-used-in-production",
    emailAndPassword: { enabled: true, requireEmailVerification: true, autoSignIn: false },
    emailVerification: {
      expiresIn: 1,
      async sendVerificationEmail({ url }) { verificationUrl = url; },
    },
    rateLimit: { enabled: false },
  });
  const signUp = await auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ name: "Expiry Test", email: "expiry-test@example.com", password: "Useful-Pass9!" }),
  }));
  assert.equal(signUp.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const result = await auth.handler(new Request(verificationUrl));
  assert.equal(result.status, 302);
  assert.match(result.headers.get("location") ?? "", /TOKEN_EXPIRED/);
});

test("verification resend is rate limited", async () => {
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "a-long-test-secret-that-is-not-used-in-production",
    emailAndPassword: { enabled: true, requireEmailVerification: true },
    emailVerification: { async sendVerificationEmail() {} },
    rateLimit: {
      enabled: true,
      storage: "memory",
      customRules: { "/send-verification-email": { window: 60 * 60, max: 3 } },
    },
  });
  const request = () => auth.handler(new Request("http://localhost:3000/api/auth/send-verification-email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": "192.0.2.10" },
    body: JSON.stringify({ email: "missing@example.com" }),
  }));
  for (let i = 0; i < 3; i++) assert.equal((await request()).status, 200);
  assert.equal((await request()).status, 429);
});

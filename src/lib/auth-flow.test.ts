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

test("password reset emails a one-time link that revokes the old password", async () => {
  let verificationUrl = "";
  let resetUrl = "";
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "a-long-test-secret-that-is-not-used-in-production",
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ url }) { resetUrl = url; },
    },
    emailVerification: { async sendVerificationEmail({ url }) { verificationUrl = url; } },
    rateLimit: { enabled: false },
  });
  const request = (path: string, body: object) => auth.handler(new Request(`http://localhost:3000/api/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  }));
  const email = "reset-test@example.com";
  const original = "Useful-Pass9!";
  await request("sign-up/email", { name: "Reset Test", email, password: original, callbackURL: "/login?verified=1&callbackURL=%2F" });
  const verified = await auth.handler(new Request(verificationUrl));
  assert.equal(verified.status, 302);

  const sent = await request("request-password-reset", { email, redirectTo: "/reset-password" });
  assert.equal(sent.status, 200);
  assert.match(resetUrl, /^http:\/\/localhost:3000\/api\/auth\/reset-password\/[A-Za-z0-9]+\?callbackURL=%2Freset-password$/);
  const token = new URL(resetUrl).pathname.split("/").pop()!;
  const callback = await auth.handler(new Request(resetUrl));
  assert.equal(callback.status, 302);
  assert.equal(new URL(callback.headers.get("location")!).pathname, "/reset-password");

  const weak = await request("reset-password", { token, newPassword: "short" });
  assert.equal(weak.status, 400);

  const first = await request("reset-password", { token, newPassword: "Reset-Pass9!" });
  assert.equal(first.status, 200);
  const oldSignIn = await request("sign-in/email", { email, password: original });
  assert.equal(oldSignIn.status, 401);
  const newSignIn = await request("sign-in/email", { email, password: "Reset-Pass9!" });
  assert.equal(newSignIn.status, 200);

  const reused = await request("reset-password", { token, newPassword: "Again-Pass9!" });
  assert.equal(reused.status, 400);
  assert.equal((await reused.json()).code, "INVALID_TOKEN");
});

test("password reset never reveals whether an email exists", async () => {
  let sent = false;
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "a-long-test-secret-that-is-not-used-in-production",
    emailAndPassword: {
      enabled: true,
      async sendResetPassword() { sent = true; },
    },
    rateLimit: { enabled: false },
  });
  const response = await auth.handler(new Request("http://localhost:3000/api/auth/request-password-reset", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ email: "missing@example.com", redirectTo: "/login?reset=success" }),
  }));
  assert.equal(response.status, 200);
  assert.equal(sent, false);
  assert.equal((await response.json()).status, true);
});

test("password reset requests are rate limited", async () => {
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "a-long-test-secret-that-is-not-used-in-production",
    emailAndPassword: { enabled: true, async sendResetPassword() {} },
    rateLimit: {
      enabled: true,
      storage: "memory",
      customRules: { "/request-password-reset": { window: 60 * 60, max: 3 } },
    },
  });
  const request = () => auth.handler(new Request("http://localhost:3000/api/auth/request-password-reset", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": "192.0.2.11" },
    body: JSON.stringify({ email: "missing@example.com" }),
  }));
  for (let i = 0; i < 3; i++) assert.equal((await request()).status, 200);
  assert.equal((await request()).status, 429);
});

test("Microsoft OAuth starts the Entra ID flow and links only verified same-email identities", async () => {
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "a-long-test-secret-that-is-not-used-in-production",
    socialProviders: {
      microsoft: {
        clientId: "microsoft-test-client-id",
        clientSecret: "microsoft-test-client-secret",
        requireEmailVerification: true,
      },
    },
    account: {
      encryptOAuthTokens: false,
      accountLinking: {
        enabled: true,
        allowDifferentEmails: false,
        requireLocalEmailVerified: true,
      },
    },
    rateLimit: { enabled: false },
  });
  const socialSignIn = (provider: string) => auth.handler(new Request("http://localhost:3000/api/auth/sign-in/social", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ provider, callbackURL: "/" }),
  }));
  const signIn = await socialSignIn("microsoft");
  assert.equal(signIn.status, 200);
  const body = (await signIn.json()) as { redirect: boolean; url: string };
  assert.equal(body.redirect, true);
  const location = new URL(body.url);
  assert.equal(location.origin, "https://login.microsoftonline.com");
  assert.match(location.pathname, /common\/oauth2\/v2\.0\/authorize/);
  assert.equal(location.searchParams.get("client_id"), "microsoft-test-client-id");
  assert.equal(location.searchParams.get("redirect_uri"), "http://localhost:3000/api/auth/callback/microsoft");

  const unknown = await socialSignIn("unknown");
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).code, "PROVIDER_NOT_FOUND");
});

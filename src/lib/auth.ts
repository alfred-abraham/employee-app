import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { isPasswordAllowed, passwordPolicy } from "@/lib/auth-validation";
import { recordSignIn } from "@/lib/role-repository";
import { accountBlockHooks } from "@/lib/account-block-auth";
import { isAccountBlocked, isEmailBlocked, acceptCreatedSession } from "@/lib/account-block-repository";
import { consumeVerificationToken, hasPendingVerificationToken, sendAccountVerificationEmail, verificationLifetimeSeconds } from "@/lib/verification-email";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const isGoogleAuthConfigured = Boolean(googleClientId && googleClientSecret);
const blockingHooks = accountBlockHooks(isAccountBlocked, isEmailBlocked, acceptCreatedSession);

export const auth = betterAuth({
  appName: "PeopleCore",
  databaseHooks: {
    user: blockingHooks.user,
    session: { create: { before: blockingHooks.session.create.before, after: async (session) => {
      await blockingHooks.session.create.after(session);
      await recordSignIn(session.userId, session.createdAt);
    } } },
  },
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: passwordPolicy.minLength,
    maxPasswordLength: passwordPolicy.maxLength,
    autoSignIn: false,
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: false,
    autoSignInAfterVerification: false,
    expiresIn: verificationLifetimeSeconds,
    async sendVerificationEmail({ user, url, token }) {
      await sendAccountVerificationEmail(user, url, token);
    },
    async beforeEmailVerification(user, request) {
      const token = request ? new URL(request.url).searchParams.get("token") : null;
      if (!token || !await consumeVerificationToken(user.id, token)) {
        throw new APIError("UNAUTHORIZED", { code: "INVALID_TOKEN", message: "Verification link has expired or was already used." });
      }
    },
  },
  socialProviders: isGoogleAuthConfigured ? {
    google: {
      clientId: googleClientId!,
      clientSecret: googleClientSecret!,
      requireEmailVerification: true,
    },
  } : {},
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      allowDifferentEmails: false,
      requireLocalEmailVerified: true,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60 * 60, max: 5 },
      "/send-verification-email": { window: 60 * 60, max: 3 },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (context) => {
      if (context.path === "/verify-email") {
        const token = context.request ? new URL(context.request.url).searchParams.get("token") : null;
        if (!token || !await hasPendingVerificationToken(token)) {
          throw context.redirect("/login?verification=invalid");
        }
        return;
      }
      if (context.path !== "/sign-up/email") return;
      if (!isPasswordAllowed(context.body?.password)) {
        throw new APIError("BAD_REQUEST", {
          code: "PASSWORD_POLICY_FAILED",
          message: `Password must contain ${passwordPolicy.description}.`,
        });
      }
    }),
  },
});

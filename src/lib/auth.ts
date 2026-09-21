import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { isPasswordAllowed, passwordPolicy } from "@/lib/auth-validation";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const isGoogleAuthConfigured = Boolean(googleClientId && googleClientSecret);

export const auth = betterAuth({
  appName: "PeopleCore",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: passwordPolicy.minLength,
    maxPasswordLength: passwordPolicy.maxLength,
    autoSignIn: false,
  },
  socialProviders: isGoogleAuthConfigured ? {
    google: {
      clientId: googleClientId!,
      clientSecret: googleClientSecret!,
    },
  } : {},
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      allowDifferentEmails: false,
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
    },
  },
  hooks: {
    before: createAuthMiddleware(async (context) => {
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

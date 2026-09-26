import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { verification } from "@/db/schema";

const verificationLifetimeSeconds = 60 * 60;

function tokenDigest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function tokenIdentifier(userId: string) {
  return `email-verification:${userId}`;
}

export async function sendAccountVerificationEmail(user: { id: string; email: string }, url: string, token: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.VERIFICATION_EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Verification email delivery is not configured.");

  const id = randomUUID();
  const identifier = tokenIdentifier(user.id);
  await db.transaction(async (tx) => {
    await tx.delete(verification).where(eq(verification.identifier, identifier));
    await tx.insert(verification).values({
      id,
      identifier,
      value: tokenDigest(token),
      expiresAt: new Date(Date.now() + verificationLifetimeSeconds * 1000),
    });
  });

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [user.email],
        subject: "Verify your PeopleCore email",
        text: `Verify your PeopleCore email address by opening this link within one hour:\n\n${url}\n\nIf you did not create this account, you can ignore this message.`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Verification email delivery failed.");
  } catch {
    await db.delete(verification).where(eq(verification.id, id));
    throw new Error("Verification email delivery failed.");
  }
}

export async function hasPendingVerificationToken(token: string) {
  const [record] = await db.select({ id: verification.id }).from(verification).where(and(
    eq(verification.value, tokenDigest(token)),
    gt(verification.expiresAt, new Date()),
  )).limit(1);
  return Boolean(record);
}

export async function consumeVerificationToken(userId: string, token: string) {
  const [record] = await db.delete(verification).where(and(
    eq(verification.identifier, tokenIdentifier(userId)),
    eq(verification.value, tokenDigest(token)),
    gt(verification.expiresAt, new Date()),
  )).returning({ id: verification.id });
  return Boolean(record);
}

export { verificationLifetimeSeconds };

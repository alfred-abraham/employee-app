import { z } from "zod";

export const passwordPolicy = {
  minLength: 12,
  maxLength: 128,
  description: "12–128 characters with uppercase, lowercase, number, and symbol",
} as const;

export const passwordSchema = z
  .string()
  .min(passwordPolicy.minLength)
  .max(passwordPolicy.maxLength)
  .regex(/[a-z]/)
  .regex(/[A-Z]/)
  .regex(/[0-9]/)
  .regex(/[^A-Za-z0-9]/);

export function isPasswordAllowed(password: unknown): password is string {
  return passwordSchema.safeParse(password).success;
}

export function safeCallbackURL(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return "/";
  return candidate;
}

import { z } from "zod";

export const roles = ["viewer", "editor", "admin"] as const;
export type Role = typeof roles[number];
export type RoleGrant = { role: string; expiresAt: Date | string | null };
export type Permission = "read" | "write" | "admin";

export function activeRoles(grants: RoleGrant[], now = new Date()): Role[] {
  return roles.filter((role) => grants.some((grant) => grant.role === role &&
    (grant.expiresAt === null || new Date(grant.expiresAt).getTime() > now.getTime())));
}

export function permits(active: readonly Role[], permission: Permission) {
  return active.includes("admin") || (permission === "write" && active.includes("editor")) ||
    (permission === "read" && active.length > 0);
}

export function accessStatus(grants: RoleGrant[], now = new Date()) {
  return activeRoles(grants, now).length ? "active" : grants.length ? "expired" : "pending";
}

export function roleInput(now = new Date()) {
  return z.object({
    role: z.enum(roles),
    expiresAt: z.iso.datetime({ offset: true }).nullable().default(null).refine(
      (value) => value === null || new Date(value).getTime() > now.getTime(),
      "Expiry must be a future date and time with a timezone, or null for no expiry.",
    ),
  }).strict();
}

// A permanent administrator prevents scheduled expiries from locking everybody out.
export function hasPermanentAdmin(grants: RoleGrant[]) {
  return grants.some((grant) => grant.role === "admin" && grant.expiresAt === null);
}

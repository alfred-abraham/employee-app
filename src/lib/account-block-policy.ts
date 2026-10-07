import { z } from "zod";

export type AccountBlock = { expiresAt: Date | string | null };
export function isBlockActive(block: AccountBlock | null | undefined, now = new Date()) {
  return Boolean(block && (!block.expiresAt || new Date(block.expiresAt).getTime() > now.getTime()));
}
export function blockInput(now = new Date()) {
  return z.object({
    reason: z.string().trim().min(1, "Enter an internal reason.").max(1000),
    expiresAt: z.iso.datetime({ offset: true }).nullable().default(null).refine(value => !value || new Date(value) > now, "Expiry must be in the future."),
  }).strict();
}
export const unblockInput = z.object({ reason: z.string().trim().min(1, "Enter an internal reason.").max(1000) }).strict();

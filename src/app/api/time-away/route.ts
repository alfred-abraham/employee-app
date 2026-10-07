import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth-session";
import { apiError } from "@/lib/http";
import { createTimeAway, listTimeAway } from "@/lib/time-away-repository";
import { timeAwayInputSchema } from "@/lib/time-away-validation";

export const runtime = "nodejs";
const querySchema = z.object({ scope: z.enum(["all", "current", "upcoming", "past", "cancelled"]).default("all"), page: z.coerce.number().int().min(1).max(1_000_000).default(1), employeeSearch: z.string().trim().max(100).optional() });

export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, "read");
  if (denied) return denied;
  try {
    const params = request.nextUrl.searchParams;
    const parsed = querySchema.safeParse({ scope: params.get("scope") ?? undefined, page: params.get("page") ?? undefined, employeeSearch: params.get("employeeSearch") ?? undefined });
    if (!parsed.success) return NextResponse.json({ error: "Invalid time-away filters." }, { status: 400 });
    return NextResponse.json(await listTimeAway(parsed.data));
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission(request, "admin");
  if (denied) return denied;
  try {
    const parsed = timeAwayInputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid time-away details." }, { status: 400 });
    return NextResponse.json({ entry: await createTimeAway(parsed.data) }, { status: 201 });
  } catch (error) { return apiError(error); }
}

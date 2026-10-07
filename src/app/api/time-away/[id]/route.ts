import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth-session";
import { apiError } from "@/lib/http";
import { cancelTimeAway, updateTimeAway } from "@/lib/time-away-repository";
import { timeAwayInputSchema } from "@/lib/time-away-validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const denied = await requirePermission(request, "admin");
  if (denied) return denied;
  try {
    const parsed = timeAwayInputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid time-away details." }, { status: 400 });
    return NextResponse.json({ entry: await updateTimeAway((await context.params).id, parsed.data) });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: NextRequest, context: Context) {
  const denied = await requirePermission(request, "admin");
  if (denied) return denied;
  try { return NextResponse.json({ entry: await cancelTimeAway((await context.params).id) }); }
  catch (error) { return apiError(error); }
}

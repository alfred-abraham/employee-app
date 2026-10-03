import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession, authenticationRequired, requirePermission } from "@/lib/auth-session";
import { changeRole } from "@/lib/role-repository";
import { roleInput, roles } from "@/lib/role-policy";
import { apiError } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

async function change(request: NextRequest, context: Context, revoke: boolean) {
  try {
    const session = await getRequestSession(request);
    if (!session) return authenticationRequired();
    const denied = await requirePermission(request, "admin");
    if (denied) return denied;
    const payload: unknown = await request.json();
    const parsed = (revoke ? z.object({ role: z.enum(roles) }).strict() : roleInput()).safeParse(payload);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid role assignment." }, { status: 400 });
    const expiresAt = "expiresAt" in parsed.data ? parsed.data.expiresAt as string | null : null;
    await changeRole(session.user.id, (await context.params).id, parsed.data.role, expiresAt, revoke);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    return apiError(error);
  }
}

export async function PUT(request: NextRequest, context: Context) { return change(request, context, false); }
export async function DELETE(request: NextRequest, context: Context) { return change(request, context, true); }

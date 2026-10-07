import { NextRequest, NextResponse } from "next/server";
import { authenticationRequired, getRequestSession, requirePermission } from "@/lib/auth-session";
import { blockInput, unblockInput } from "@/lib/account-block-policy";
import { changeAccountBlock } from "@/lib/account-block-repository";
import { apiError } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };
async function change(request: NextRequest, context: Context, unblock: boolean) {
  try {
    const session = await getRequestSession(request);
    if (!session) return authenticationRequired();
    const denied = await requirePermission(request, "admin");
    if (denied) return denied;
    const parsed = (unblock ? unblockInput : blockInput()).safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid account block." }, { status: 400 });
    await changeAccountBlock(session.user.id, (await context.params).id, parsed.data.reason, "expiresAt" in parsed.data ? parsed.data.expiresAt as string | null : null, unblock);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    return apiError(error);
  }
}
export async function PUT(request: NextRequest, context: Context) { return change(request, context, false); }
export async function DELETE(request: NextRequest, context: Context) { return change(request, context, true); }

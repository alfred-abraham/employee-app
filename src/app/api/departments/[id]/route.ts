import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticationRequired, getRequestSession } from "@/lib/auth-session";
import { reactivateDepartment, renameDepartment, retireDepartment } from "@/lib/department-repository";
import { apiError } from "@/lib/http";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const input = z.object({ name: z.string().trim().min(2).max(100).optional(), active: z.boolean().optional() }).refine((value) => value.name !== undefined || value.active !== undefined);

export async function PATCH(request: NextRequest, context: Context) {
  if (!await getRequestSession(request)) return authenticationRequired();
  try {
    const parsed = input.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid department name or state." }, { status: 400 });
    const { id } = await context.params;
    if (parsed.data.name && parsed.data.active !== undefined) return NextResponse.json({ error: "Change the name and state separately." }, { status: 400 });
    const department = parsed.data.name ? await renameDepartment(id, parsed.data.name) : parsed.data.active ? await reactivateDepartment(id) : await retireDepartment(id);
    return NextResponse.json({ department });
  } catch (error) { return apiError(error); }
}

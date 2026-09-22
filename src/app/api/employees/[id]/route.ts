import { NextRequest, NextResponse } from "next/server";
import { deleteEmployee, getEmployee, updateEmployee } from "@/lib/employee-repository";
import { employeePatchSchema } from "@/lib/employee-validation";
import { apiError } from "@/lib/http";
import { authenticationRequired, getRequestSession } from "@/lib/auth-session";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  if (!await getRequestSession(request)) return authenticationRequired();
  try {
    const employee = await getEmployee((await context.params).id);
    return employee ? NextResponse.json({ employee }) : NextResponse.json({ error: "Employee not found." }, { status: 404 });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: NextRequest, context: Context) {
  if (!await getRequestSession(request)) return authenticationRequired();
  try {
    const parsed = employeePatchSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Please correct the highlighted employee details.", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
    const employee = await updateEmployee((await context.params).id, parsed.data);
    return employee ? NextResponse.json({ employee }) : NextResponse.json({ error: "Employee not found." }, { status: 404 });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: NextRequest, context: Context) {
  if (!await getRequestSession(request)) return authenticationRequired();
  try { return (await deleteEmployee((await context.params).id)) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Employee not found." }, { status: 404 }); }
  catch (error) { return apiError(error); }
}

import { NextRequest, NextResponse } from "next/server";
import { createEmployee, employeeOwnership, employeeStats, listDepartments, listEmployees } from "@/lib/employee-repository";
import { parseEmployeeQuery } from "@/lib/employee-query";
import { employeeInputSchema } from "@/lib/employee-validation";
import { apiError, ServiceError } from "@/lib/http";
import { employeeActor } from "@/lib/employee-access";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const actor = await employeeActor(request, "read");
    const query = parseEmployeeQuery(request.nextUrl.searchParams);
    if (!query) return NextResponse.json({ error: "Invalid employee search or paging parameters." }, { status: 400 });
    const [result, stats, departments] = await Promise.all([listEmployees(query), employeeStats(), listDepartments()]);
    let ownEmployee = null, ownershipError = "";
    if (!actor.isAdmin) {
      try { ownEmployee = await employeeOwnership(actor); }
      catch (error) { if (!(error instanceof ServiceError) || error.status !== 409) throw error; ownershipError = error.message; }
    }
    return NextResponse.json({ ...result, stats, departments, ownEmployee, ownershipError });
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await employeeActor(request, "write");
    const parsed = employeeInputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Please correct the highlighted employee details.", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
    return NextResponse.json({ employee: await createEmployee(parsed.data, actor) }, { status: 201 });
  } catch (error) { return apiError(error); }
}

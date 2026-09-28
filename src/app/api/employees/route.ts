import { NextRequest, NextResponse } from "next/server";
import { createEmployee, employeeStats, listDepartments, listEmployees } from "@/lib/employee-repository";
import { parseEmployeeQuery } from "@/lib/employee-query";
import { employeeInputSchema } from "@/lib/employee-validation";
import { apiError } from "@/lib/http";
import { authenticationRequired, getRequestSession } from "@/lib/auth-session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!await getRequestSession(request)) return authenticationRequired();
  try {
    const query = parseEmployeeQuery(request.nextUrl.searchParams);
    if (!query) return NextResponse.json({ error: "Invalid employee search or paging parameters." }, { status: 400 });
    const [result, stats, departments] = await Promise.all([listEmployees(query), employeeStats(), listDepartments()]);
    return NextResponse.json({ ...result, stats, departments });
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  if (!await getRequestSession(request)) return authenticationRequired();
  try {
    const parsed = employeeInputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Please correct the highlighted employee details.", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
    return NextResponse.json({ employee: await createEmployee(parsed.data) }, { status: 201 });
  } catch (error) { return apiError(error); }
}

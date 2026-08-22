import { NextRequest, NextResponse } from "next/server";
import { createEmployee, employeeStats, listEmployees } from "@/lib/employee-repository";
import { employeeInputSchema } from "@/lib/employee-validation";
import { apiError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const employees = await listEmployees({ search: params.get("search") || undefined, department: params.get("department") || undefined, status: params.get("status") || undefined });
    return NextResponse.json({ employees, stats: await employeeStats() });
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = employeeInputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Please correct the highlighted employee details.", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
    return NextResponse.json({ employee: await createEmployee(parsed.data) }, { status: 201 });
  } catch (error) { return apiError(error); }
}

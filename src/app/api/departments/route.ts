import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticationRequired, getRequestSession } from "@/lib/auth-session";
import { createDepartment, departmentOverview } from "@/lib/department-repository";
import { apiError } from "@/lib/http";

export const runtime = "nodejs";
const input = z.object({ name: z.string().trim().min(2).max(100) });

export async function GET(request: NextRequest) {
  if (!await getRequestSession(request)) return authenticationRequired();
  try { return NextResponse.json({ departments: await departmentOverview() }); }
  catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  if (!await getRequestSession(request)) return authenticationRequired();
  try {
    const parsed = input.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Enter a department name between 2 and 100 characters." }, { status: 400 });
    return NextResponse.json({ department: await createDepartment(parsed.data.name) }, { status: 201 });
  } catch (error) { return apiError(error); }
}

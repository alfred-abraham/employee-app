import { NextRequest, NextResponse } from "next/server";
import { authenticationRequired, getRequestSession } from "@/lib/auth-session";
import { findMyEmployee, homeAddressSchema, readMyAddress, requireLinkedEmployee, saveMyAddress } from "@/lib/home-address";
import { apiError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) return authenticationRequired();
  try {
    const employee = await findMyEmployee(session.user.id, session.user.email, session.user.emailVerified);
    if (!employee) return NextResponse.json({ linked: false, address: null });
    return NextResponse.json({ linked: true, employeeName: `${employee.firstName} ${employee.lastName}`, address: await readMyAddress(employee.id) });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) return authenticationRequired();
  try {
    const parsed = homeAddressSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Enter a complete home address." }, { status: 400 });
    const employee = requireLinkedEmployee(await findMyEmployee(session.user.id, session.user.email, session.user.emailVerified));
    return NextResponse.json({ address: await saveMyAddress(employee.id, parsed.data) });
  } catch (error) { return apiError(error); }
}

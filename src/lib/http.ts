import { NextResponse } from "next/server";

export class ServiceError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function apiError(error: unknown) {
  if (error instanceof ServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(error);
  const candidate = error as { code?: string };
  if (candidate.code === "23505") return NextResponse.json({ error: "An employee with that number or email already exists." }, { status: 409 });
  if (candidate.code === "BAD_DEPARTMENT") return NextResponse.json({ error: "Choose an active department." }, { status: 400 });
  return NextResponse.json({ error: "The employee service is temporarily unavailable." }, { status: 500 });
}

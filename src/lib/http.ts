import { NextResponse } from "next/server";

export function apiError(error: unknown) {
  console.error(error);
  const candidate = error as { code?: string };
  if (candidate.code === "23505") return NextResponse.json({ error: "An employee with that number or email already exists." }, { status: 409 });
  return NextResponse.json({ error: "The employee service is temporarily unavailable." }, { status: 500 });
}

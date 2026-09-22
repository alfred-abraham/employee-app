import "server-only";

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function getCurrentSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function getRequestSession(request: Request) {
  return auth.api.getSession({ headers: request.headers });
}

export function authenticationRequired() {
  return NextResponse.json({ error: "Authentication required." }, { status: 401 });
}

import { NextRequest, NextResponse } from "next/server";
import { authenticationRequired, getRequestSession } from "@/lib/auth-session";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  if (!await getRequestSession(request)) return authenticationRequired();
  return NextResponse.json({ embedKey: process.env.GOOGLE_MAPS_EMBED_KEY || null, suggestionsAvailable: Boolean(process.env.GOOGLE_MAPS_SERVER_KEY) });
}

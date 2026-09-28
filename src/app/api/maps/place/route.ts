import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticationRequired, getRequestSession } from "@/lib/auth-session";

export const runtime = "nodejs";
const input = z.object({ placeId: z.string().min(3).max(255).regex(/^[a-zA-Z0-9_-]+$/), sessionToken: z.uuid() });

export async function POST(request: NextRequest) {
  if (!await getRequestSession(request)) return authenticationRequired();
  const parsed = input.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid place selection." }, { status: 400 });
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) return NextResponse.json({ error: "Google Maps is unavailable. Enter the address manually." }, { status: 503 });
  try {
    const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(parsed.data.placeId)}`);
    url.searchParams.set("sessionToken", parsed.data.sessionToken);
    const response = await fetch(url, { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "id,formattedAddress,addressComponents" }, cache: "no-store" });
    if (!response.ok) throw new Error(`Place details returned ${response.status}`);
    const data = await response.json();
    return NextResponse.json({ place: data });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Place details are unavailable. Enter the address manually." }, { status: 503 }); }
}

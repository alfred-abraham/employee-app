import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticationRequired, getRequestSession } from "@/lib/auth-session";

export const runtime = "nodejs";
const querySchema = z.object({ input: z.string().trim().min(3).max(120), sessionToken: z.uuid() });

export async function GET(request: NextRequest) {
  if (!await getRequestSession(request)) return authenticationRequired();
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Enter at least three characters for address suggestions." }, { status: 400 });
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) return NextResponse.json({ error: "Address suggestions are unavailable. Enter the address manually." }, { status: 503 });
  try {
    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text" },
      body: JSON.stringify({ input: parsed.data.input, sessionToken: parsed.data.sessionToken, includeQueryPredictions: false }), cache: "no-store",
    });
    if (!response.ok) throw new Error(`Places autocomplete returned ${response.status}`);
    const data = await response.json();
    const suggestions = (data.suggestions ?? []).flatMap((item: { placePrediction?: { placeId?: string; text?: { text?: string } } }) => item.placePrediction?.placeId && item.placePrediction.text?.text ? [{ placeId: item.placePrediction.placeId, text: item.placePrediction.text.text }] : []);
    return NextResponse.json({ suggestions });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Address suggestions are unavailable. Enter the address manually." }, { status: 503 }); }
}

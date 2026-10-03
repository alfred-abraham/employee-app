import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth-session";
import { findWorkplacePlaces, isGeographicLocation } from "@/lib/workplace-maps";

export const runtime = "nodejs";
const locationSchema = z.string().trim().min(2).max(120);

export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, "read");
  if (denied) return denied;
  const parsed = locationSchema.safeParse(request.nextUrl.searchParams.get("location"));
  if (!parsed.success) return NextResponse.json({ error: "Choose a workplace location to view." }, { status: 400 });
  if (!isGeographicLocation(parsed.data)) return NextResponse.json({ places: [], embedKey: null });
  const serverKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  const embedKey = process.env.GOOGLE_MAPS_EMBED_KEY;
  if (!serverKey || !embedKey) return NextResponse.json({ error: "The map preview is unavailable. Open this location in Google Maps instead." }, { status: 503 });
  try {
    const places = await findWorkplacePlaces(parsed.data, serverKey);
    return NextResponse.json({ places, embedKey }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "The location could not be looked up. Open Google Maps to search for it." }, { status: 503 });
  }
}

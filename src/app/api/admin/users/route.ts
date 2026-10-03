import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth-session";
import { listUsers } from "@/lib/role-repository";
import { apiError } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    const denied = await requirePermission(request, "admin");
    if (denied) return denied;
    const parsed = z.object({ search: z.string().trim().max(100), page: z.coerce.number().int().min(1).max(1_000_000) }).safeParse({
      search: request.nextUrl.searchParams.get("search") ?? "", page: request.nextUrl.searchParams.get("page") ?? "1",
    });
    if (!parsed.success) return NextResponse.json({ error: "Invalid user search or page." }, { status: 400 });
    return NextResponse.json(await listUsers(parsed.data.search, parsed.data.page), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

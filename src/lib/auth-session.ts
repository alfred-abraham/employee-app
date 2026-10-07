import "server-only";

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActiveRoles } from "@/lib/role-repository";
import { permits, type Permission } from "@/lib/role-policy";
import { redirect } from "next/navigation";
import { isAccountBlocked } from "@/lib/account-block-repository";

export async function getCurrentSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session && !await isAccountBlocked(session.user.id) ? session : null;
}

export async function getRequestSession(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session && !await isAccountBlocked(session.user.id) ? session : null;
}

export function authenticationRequired() {
  return NextResponse.json({ error: "Authentication required." }, { status: 401 });
}

export async function requirePermission(request: Request, permission: Permission) {
  const session = await getRequestSession(request);
  if (!session) return authenticationRequired();
  const active = await getActiveRoles(session.user.id);
  if (!permits(active, permission)) return NextResponse.json({ error: active.length ? "You do not have permission to perform this action." : "Your access is pending approval or has expired. Contact an administrator." }, { status: 403 });
  return null;
}

export async function requirePagePermission(permission: Permission = "read", callbackURL = "/") {
  const session = await getCurrentSession();
  if (!session) redirect(`/login?callbackURL=${encodeURIComponent(callbackURL)}`);
  const roles = await getActiveRoles(session.user.id);
  if (!permits(roles, permission)) redirect(roles.length ? "/" : "/access-pending");
  return { ...session.user, image: session.user.image ?? null, roles };
}

export async function currentShellUser(callbackURL = "/") {
  const session = await getCurrentSession();
  if (!session) redirect(`/login?callbackURL=${encodeURIComponent(callbackURL)}`);
  return { ...session.user, image: session.user.image ?? null, roles: await getActiveRoles(session.user.id) };
}

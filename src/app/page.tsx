import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { EmployeeDirectory } from "@/components/employee-directory";
import { requirePagePermission } from "@/lib/auth-session";

const title = "PeopleCore | Employee Directory";
const description = "Employee operations, clearly organized.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const candidateHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const host = /^[a-z0-9.-]+(?::\d+)?$/i.test(candidateHost) ? candidateHost : "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") === "https" ? "https" : "http";
  const image = `${protocol}://${host}/og.png`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website", images: [{ url: image, width: 1732, height: 909, alt: "PeopleCore employee operations" }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function Home() {
  const user = await requirePagePermission();

  return <Suspense fallback={<div className="p-8 text-sm text-[#66736b]">Loading directory…</div>}><EmployeeDirectory user={user} /></Suspense>;
}

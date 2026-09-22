import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { EmployeeDirectory } from "@/components/employee-directory";
import { getCurrentSession } from "@/lib/auth-session";

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
  const session = await getCurrentSession();
  if (!session) redirect("/login?callbackURL=%2F");

  return <EmployeeDirectory user={{ name: session.user.name, email: session.user.email }} />;
}

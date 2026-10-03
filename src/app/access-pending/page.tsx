import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { currentShellUser } from "@/lib/auth-session";

export const metadata = { title: "PeopleCore | Access pending" };

export default async function AccessPendingPage() {
  const user = await currentShellUser("/access-pending");
  if (user.roles.length) redirect("/");
  return <AppShell user={user} section="pending" title="Access pending"><div className="mx-auto max-w-xl p-8"><section className="rounded-2xl border border-[#dfe4e1] bg-white p-6"><h2 className="text-xl font-semibold">Waiting for access</h2><p className="mt-3 text-sm text-[#66736b]">You are signed in as {user.email}. An administrator needs to assign you a role before you can access employee information. If your previous access expired, ask an administrator to renew it.</p><Link href="/" prefetch={false} className="mt-5 inline-block rounded-lg bg-[#173f2b] px-4 py-2 text-sm text-white">Check access again</Link><p className="mt-4 text-sm">You can still update your own profile photo and home address.</p></section></div></AppShell>;
}

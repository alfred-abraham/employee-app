import { redirect } from "next/navigation";
import { TimeAwayScreen } from "@/components/time-away-screen";
import { getCurrentSession } from "@/lib/auth-session";

export default async function TimeAwayPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login?callbackURL=%2Ftime-away");
  return <TimeAwayScreen user={{ name: session.user.name, email: session.user.email, image: session.user.image ?? null }}/>;
}

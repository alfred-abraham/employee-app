import { TimeAwayScreen } from "@/components/time-away-screen";
import { requirePagePermission } from "@/lib/auth-session";

export default async function TimeAwayPage() {
  const user = await requirePagePermission("read", "/time-away");
  return <TimeAwayScreen user={user}/>;
}

import { redirect } from "next/navigation";
import { MyAddressScreen } from "@/components/my-address-screen";
import { getCurrentSession } from "@/lib/auth-session";

export default async function MyAddressPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login?callbackURL=%2Fmy-address");
  return <MyAddressScreen user={{ name: session.user.name, email: session.user.email, image: session.user.image ?? null }}/>;
}

import { MyAddressScreen } from "@/components/my-address-screen";
import { currentShellUser } from "@/lib/auth-session";

export default async function MyAddressPage() {
  const user = await currentShellUser("/my-address");
  return <MyAddressScreen user={user}/>;
}

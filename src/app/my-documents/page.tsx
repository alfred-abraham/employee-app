import { MyDocumentsScreen } from "@/components/my-documents-screen";
import { currentShellUser } from "@/lib/auth-session";

export default async function MyDocumentsPage() {
  return <MyDocumentsScreen user={await currentShellUser()}/>;
}

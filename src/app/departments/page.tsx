import { DepartmentsScreen } from "@/components/departments-screen";
import { requirePagePermission } from "@/lib/auth-session";

export default async function DepartmentsPage() {
  const user = await requirePagePermission("read", "/departments");
  return <DepartmentsScreen user={user}/>;
}

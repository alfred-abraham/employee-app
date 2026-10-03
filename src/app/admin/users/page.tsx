import { AdminUsersScreen } from "@/components/admin-users-screen";
import { requirePagePermission } from "@/lib/auth-session";

export const metadata = { title: "PeopleCore | User access" };

export default async function AdminUsersPage() {
  return <AdminUsersScreen user={await requirePagePermission("admin", "/admin/users")} />;
}

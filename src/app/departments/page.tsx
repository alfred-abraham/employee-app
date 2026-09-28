import { redirect } from "next/navigation";
import { DepartmentsScreen } from "@/components/departments-screen";
import { getCurrentSession } from "@/lib/auth-session";

export default async function DepartmentsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login?callbackURL=%2Fdepartments");
  return <DepartmentsScreen user={{ name: session.user.name, email: session.user.email, image: session.user.image ?? null }}/>;
}

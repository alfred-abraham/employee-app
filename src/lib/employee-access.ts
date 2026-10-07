import { getRequestSession } from "./auth-session";
import { getActiveRoles } from "./role-repository";
import { permits } from "./role-policy";
import { ServiceError } from "./http";

export type EmployeeActor = { id: string; email: string; emailVerified: boolean; isAdmin: boolean };

export async function employeeActor(request: Request, permission: "read" | "write"): Promise<EmployeeActor> {
  const session = await getRequestSession(request);
  if (!session) throw new ServiceError("Authentication required.", 401);
  const roles = await getActiveRoles(session.user.id);
  if (!permits(roles, permission)) throw new ServiceError("You do not have permission to perform this action.", 403);
  return { id: session.user.id, email: session.user.email, emailVerified: session.user.emailVerified, isAdmin: permits(roles, "admin") };
}

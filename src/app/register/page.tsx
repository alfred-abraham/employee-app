import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { isGoogleAuthConfigured } from "@/lib/auth";
import { getCurrentSession } from "@/lib/auth-session";
import { safeCallbackURL } from "@/lib/auth-validation";

type RegisterPageProps = { searchParams: Promise<{ callbackURL?: string | string[] }> };

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const callbackURL = safeCallbackURL((await searchParams).callbackURL);
  if (await getCurrentSession()) redirect(callbackURL);

  return <AuthForm mode="register" callbackURL={callbackURL} googleEnabled={isGoogleAuthConfigured} />;
}

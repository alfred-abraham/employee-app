import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { isGoogleAuthConfigured } from "@/lib/auth";
import { getCurrentSession } from "@/lib/auth-session";
import { safeCallbackURL } from "@/lib/auth-validation";

type LoginPageProps = { searchParams: Promise<{ callbackURL?: string | string[]; registered?: string; error?: string }> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const callbackURL = safeCallbackURL(params.callbackURL);
  if (await getCurrentSession()) redirect(callbackURL);

  return <AuthForm mode="login" callbackURL={callbackURL} googleEnabled={isGoogleAuthConfigured} registered={params.registered === "1"} oauthError={params.error === "oauth"} />;
}

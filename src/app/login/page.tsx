import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { isGoogleAuthConfigured } from "@/lib/auth";
import { getCurrentSession } from "@/lib/auth-session";
import { safeCallbackURL } from "@/lib/auth-validation";

type LoginPageProps = { searchParams: Promise<{ callbackURL?: string | string[]; registered?: string; verified?: string; verification?: string; error?: string }> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const callbackURL = safeCallbackURL(params.callbackURL);
  if (await getCurrentSession()) redirect(callbackURL);

  return <AuthForm mode="login" callbackURL={callbackURL} googleEnabled={isGoogleAuthConfigured} registered={params.registered === "1"} verified={params.verified === "1" && !params.error} verificationError={params.verification === "invalid" || Boolean(params.error && params.error !== "oauth")} oauthError={params.error === "oauth"} />;
}

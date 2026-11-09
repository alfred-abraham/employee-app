import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { isGoogleAuthConfigured, isMicrosoftAuthConfigured } from "@/lib/auth";
import { getCurrentSession } from "@/lib/auth-session";
import { safeCallbackURL } from "@/lib/auth-validation";

type LoginPageProps = { searchParams: Promise<{ callbackURL?: string | string[]; registered?: string; verified?: string; verification?: string; reset?: string; error?: string }> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const callbackURL = safeCallbackURL(params.callbackURL);
  if (await getCurrentSession()) redirect(callbackURL);

  const resetMessage = params.reset === "success"
    ? "Password reset successfully. Sign in with your new password."
    : params.reset === "requested"
      ? "Check your inbox for the password reset link."
      : params.reset === "invalid"
        ? "This password reset link is invalid, expired, or already used. Request a new one."
        : null;

  return <AuthForm mode="login" callbackURL={callbackURL} googleEnabled={isGoogleAuthConfigured} microsoftEnabled={isMicrosoftAuthConfigured} registered={params.registered === "1"} verified={params.verified === "1" && !params.error} verificationError={params.verification === "invalid" || Boolean(params.error && params.error !== "oauth")} oauthError={params.error === "oauth"} resetMessage={resetMessage} />;
}

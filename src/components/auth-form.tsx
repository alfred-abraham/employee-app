"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, Building2, LoaderCircle, LockKeyhole, Mail, UserRound } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { isPasswordAllowed, passwordPolicy } from "@/lib/auth-validation";

type AuthFormProps = {
  mode: "login" | "register";
  callbackURL: string;
  googleEnabled: boolean;
  registered?: boolean;
  verified?: boolean;
  verificationError?: boolean;
  oauthError?: boolean;
};

export function AuthForm({ mode, callbackURL, googleEnabled, registered = false, verified = false, verificationError = false, oauthError = false }: AuthFormProps) {
  const isRegister = mode === "register";
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(registered || verificationError);
  const [resendMessage, setResendMessage] = useState("");
  const [error, setError] = useState(oauthError ? "Google sign-in could not be completed. Please try again." : verificationError ? "This verification link is invalid, expired, or already used. Enter your email to request a new link." : "");
  const [busy, setBusy] = useState<"email" | "google" | "resend" | null>(null);

  const destinationQuery = `?callbackURL=${encodeURIComponent(callbackURL)}`;
  const verificationCallbackURL = `/login?verified=1&callbackURL=${encodeURIComponent(callbackURL)}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const normalizedEmail = email.trim().toLowerCase();
    if (isRegister) {
      if (name.trim().length < 2) return setError("Enter your full name.");
      if (!isPasswordAllowed(password)) return setError(`Password must contain ${passwordPolicy.description}.`);
      if (password !== confirmation) return setError("Passwords do not match.");
    }

    setBusy("email");
    try {
      if (isRegister) {
        const result = await authClient.signUp.email({ name: name.trim(), email: normalizedEmail, password, callbackURL: verificationCallbackURL });
        if (result.error) throw new Error(result.error.message);
        setPassword("");
        setConfirmation("");
        setSubmitted(true);
        setBusy(null);
        return;
      }

      const result = await authClient.signIn.email({ email: normalizedEmail, password, callbackURL });
      if (result.error) {
        if (result.error.code === "EMAIL_NOT_VERIFIED") {
          setNeedsVerification(true);
          setError("Verify your email address before signing in. You can request a new link below.");
          setBusy(null);
          return;
        }
        throw new Error("invalid");
      }
      router.replace(callbackURL);
      router.refresh();
    } catch {
      setError(isRegister ? "We could not create the account. Check the details and try again." : "Email or password is incorrect.");
      if (isRegister) setNeedsVerification(true);
      setBusy(null);
    }
  }

  async function resendVerification() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter your email address to request a new link.");
      return;
    }
    setError("");
    setBusy("resend");
    try {
      const result = await authClient.sendVerificationEmail({ email: normalizedEmail, callbackURL: verificationCallbackURL });
      setResendMessage(result.error
        ? "We could not send a verification link right now. Please try again later."
        : "If this address has an unverified account, a new link is on its way. Check your inbox and spam folder.");
    } catch {
      setResendMessage("We could not send a verification link right now. Please try again later.");
    } finally {
      setBusy(null);
    }
  }

  async function signInWithGoogle() {
    if (!googleEnabled) return;
    setError("");
    setBusy("google");
    const errorCallbackURL = `/login?error=oauth&callbackURL=${encodeURIComponent(callbackURL)}`;
    const result = await authClient.signIn.social({ provider: "google", callbackURL, errorCallbackURL });
    if (result?.error) {
      setError("Google sign-in could not be started. Please try again.");
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#eff3f0] px-4 py-8 text-[#17221c] sm:grid sm:place-items-center sm:px-6">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-[#dbe2dd] bg-white shadow-[0_24px_80px_rgba(21,61,42,.12)] lg:grid-cols-[1.05fr_.95fr]">
        <section className="relative hidden min-h-[680px] overflow-hidden bg-[#153d2a] p-12 text-white lg:flex lg:flex-col">
          <div className="absolute -right-20 -top-20 size-72 rounded-full border-[52px] border-[#d7f06b]/10" />
          <div className="relative flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-[#d7f06b] text-[#153d2a]"><Building2 size={22} strokeWidth={2.5}/></div><div><p className="font-semibold">PeopleCore</p><p className="text-xs text-white/55">Employee operations</p></div></div>
          <div className="relative my-auto max-w-md"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#d7f06b]">Your team, clearly organized</p><h1 className="mt-5 text-5xl font-semibold leading-[1.05] tracking-[-0.045em]">People data that stays useful.</h1><p className="mt-6 max-w-sm text-base leading-7 text-white/65">A focused directory for the people, roles, and details that keep your organization moving.</p></div>
          <p className="relative text-xs text-white/40">Secure access for PeopleCore members</p>
        </section>

        <section className="flex min-h-[620px] items-center p-6 sm:p-12 lg:p-14">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-9 flex items-center gap-3 lg:hidden"><div className="grid size-10 place-items-center rounded-xl bg-[#173f2b] text-[#d7f06b]"><Building2 size={20}/></div><span className="font-semibold">PeopleCore</span></div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#568067]">{isRegister ? "Create an account" : "Welcome back"}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{isRegister ? "Join PeopleCore" : "Sign in to your workspace"}</h2>
            <p className="mt-2 text-sm leading-6 text-[#738078]">{isRegister ? "Use your work email or continue with Google." : "Access the employee directory with your account."}</p>

            {registered && <div className="mt-5 rounded-xl border border-[#bcd8c5] bg-[#eef8f1] px-4 py-3 text-sm text-[#27613b]">Check your inbox for a verification link before signing in.</div>}
            {verified && <div className="mt-5 rounded-xl border border-[#bcd8c5] bg-[#eef8f1] px-4 py-3 text-sm text-[#27613b]">Email verified. You can sign in now.</div>}
            {submitted && <div className="mt-5 rounded-xl border border-[#bcd8c5] bg-[#eef8f1] px-4 py-3 text-sm text-[#27613b]">If this address is available, we sent a verification link. Check your inbox and spam folder, then sign in after verifying.</div>}
            {error && <div role="alert" className="mt-5 rounded-xl border border-[#efc9c5] bg-[#fff5f3] px-4 py-3 text-sm text-[#9c3028]">{error}</div>}

            {!submitted && <form onSubmit={submit} className="mt-7 space-y-4">
              {isRegister && <AuthField label="Full name" name="name" autoComplete="name" value={name} onChange={setName} icon={UserRound} />}
              <AuthField label="Email address" name="email" type="email" autoComplete="email" value={email} onChange={setEmail} icon={Mail} />
              <AuthField label="Password" name="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} value={password} onChange={setPassword} icon={LockKeyhole} hint={isRegister ? passwordPolicy.description : undefined} />
              {isRegister && <AuthField label="Confirm password" name="confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={setConfirmation} icon={LockKeyhole} />}
              <button disabled={busy !== null} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#173f2b] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#24583d] disabled:cursor-wait disabled:opacity-65">{busy === "email" ? <LoaderCircle className="animate-spin" size={17}/> : <ArrowRight size={17}/>} {isRegister ? "Create account" : "Sign in"}</button>
            </form>}

            {(submitted || needsVerification) && <div className="mt-5">
              <button type="button" onClick={() => void resendVerification()} disabled={busy !== null} className="text-sm font-semibold text-[#24583d] underline disabled:opacity-50">{busy === "resend" ? "Sending…" : "Resend verification email"}</button>
              {resendMessage && <p role="status" className="mt-2 text-sm text-[#435047]">{resendMessage}</p>}
            </div>}

            <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.14em] text-[#98a29b]"><span className="h-px flex-1 bg-[#e1e6e2]"/>or<span className="h-px flex-1 bg-[#e1e6e2]"/></div>
            <button type="button" onClick={() => void signInWithGoogle()} disabled={busy !== null || !googleEnabled} className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#d5dcd7] bg-white px-4 py-3 text-sm font-semibold transition hover:bg-[#f7f9f8] disabled:cursor-not-allowed disabled:opacity-50"><span className="grid size-5 place-items-center rounded-full bg-white font-bold text-[#4285f4]">G</span>{busy === "google" ? "Connecting to Google…" : "Continue with Google"}</button>
            {!googleEnabled && <p className="mt-2 text-center text-xs text-[#8a958e]">Google sign-in is available after OAuth credentials are configured.</p>}

            <p className="mt-8 text-center text-sm text-[#6c7870]">{isRegister ? "Already have an account?" : "New to PeopleCore?"} <Link className="font-semibold text-[#24583d] hover:underline" href={`${isRegister ? "/login" : "/register"}${destinationQuery}`}>{isRegister ? "Sign in" : "Create an account"}</Link></p>
          </div>
        </section>
      </div>
    </main>
  );
}

function AuthField({ label, name, type = "text", autoComplete, value, onChange, icon: Icon, hint }: { label: string; name: string; type?: string; autoComplete: string; value: string; onChange: (value: string) => void; icon: typeof Mail; hint?: string }) {
  return <label className="block text-sm font-medium text-[#435047]">{label}<span className="relative mt-1.5 block"><Icon className="absolute left-3.5 top-3 text-[#87928b]" size={17}/><input required name={name} type={type} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-[#d5dcd7] py-2.5 pl-10 pr-3 font-normal outline-none transition focus:border-[#4c7f60] focus:ring-2 focus:ring-[#4c7f60]/15"/></span>{hint && <span className="mt-1.5 block text-xs font-normal text-[#87928b]">{hint}</span>}</label>;
}

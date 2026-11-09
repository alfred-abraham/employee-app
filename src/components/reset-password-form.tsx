"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Building2, LoaderCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { isPasswordAllowed, passwordPolicy } from "@/lib/auth-validation";
import { PasswordField } from "@/components/password-field";

type ResetPasswordFormProps = {
  token: string;
};

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!isPasswordAllowed(password)) return setError(`Password must contain ${passwordPolicy.description}.`);
    if (password !== confirmation) return setError("Passwords do not match.");

    setBusy(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        setError(result.error.code === "INVALID_TOKEN"
          ? "This reset link is invalid, expired, or already used. Request a new one."
          : result.error.message ?? "We could not reset your password right now. Please try again later.");
        setBusy(false);
        return;
      }
      router.replace("/login?reset=success");
      router.refresh();
    } catch {
      setError("We could not reset your password right now. Please try again later.");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#eff3f0] px-4 py-8 text-[#17221c] sm:grid sm:place-items-center sm:px-6">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-[#dbe2dd] bg-white shadow-[0_24px_80px_rgba(21,61,42,.12)] lg:grid-cols-[1.05fr_.95fr]">
        <section className="relative hidden min-h-[600px] overflow-hidden bg-[#153d2a] p-12 text-white lg:flex lg:flex-col">
          <div className="absolute -right-20 -top-20 size-72 rounded-full border-[52px] border-[#d7f06b]/10" />
          <div className="relative flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-[#d7f06b] text-[#153d2a]"><Building2 size={22} strokeWidth={2.5}/></div><div><p className="font-semibold">PeopleCore</p><p className="text-xs text-white/55">Employee operations</p></div></div>
          <div className="relative my-auto max-w-md"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#d7f06b]">New password</p><h1 className="mt-5 text-5xl font-semibold leading-[1.05] tracking-[-0.045em]">Choose a new password.</h1><p className="mt-6 max-w-sm text-base leading-7 text-white/65">Use at least 12 characters with uppercase, lowercase, a number, and a symbol. We will sign you in with it right after.</p></div>
          <p className="relative text-xs text-white/40">Secure access for PeopleCore members</p>
        </section>

        <section className="flex min-h-[600px] items-center p-6 sm:p-12 lg:p-14">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-9 flex items-center gap-3 lg:hidden"><div className="grid size-10 place-items-center rounded-xl bg-[#173f2b] text-[#d7f06b]"><Building2 size={20}/></div><span className="font-semibold">PeopleCore</span></div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#568067]">Reset password</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Set a new password</h2>
            <p className="mt-2 text-sm leading-6 text-[#738078]">Enter a new password and confirm it below.</p>

            {error && <div role="alert" className="mt-5 rounded-xl border border-[#efc9c5] bg-[#fff5f3] px-4 py-3 text-sm text-[#9c3028]">{error}</div>}

            <form onSubmit={submit} className="mt-7 space-y-4">
              <PasswordField label="New password" name="newPassword" autoComplete="new-password" value={password} onChange={setPassword} hint={passwordPolicy.description} />
              <PasswordField label="Confirm new password" name="confirmation" autoComplete="new-password" value={confirmation} onChange={setConfirmation} />
              <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#173f2b] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#24583d] disabled:cursor-wait disabled:opacity-65">{busy ? <LoaderCircle className="animate-spin" size={17}/> : <ArrowRight size={17}/>} Reset password</button>
            </form>

            <p className="mt-8 flex items-center gap-2 text-sm text-[#6c7870]"><ArrowLeft size={15}/> <Link className="font-semibold text-[#24583d] hover:underline" href="/login">Back to sign in</Link></p>
          </div>
        </section>
      </div>
    </main>
  );
}


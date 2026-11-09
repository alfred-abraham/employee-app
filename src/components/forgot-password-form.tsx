"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Building2, LoaderCircle, Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return setError("Enter your email address.");
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await authClient.requestPasswordReset({ email: normalizedEmail, redirectTo: "/reset-password" });
      setMessage("If this address has an account, a password reset link is on its way. Check your inbox and spam folder.");
    } catch {
      setError("We could not send a reset link right now. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#eff3f0] px-4 py-8 text-[#17221c] sm:grid sm:place-items-center sm:px-6">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-[#dbe2dd] bg-white shadow-[0_24px_80px_rgba(21,61,42,.12)] lg:grid-cols-[1.05fr_.95fr]">
        <section className="relative hidden min-h-[560px] overflow-hidden bg-[#153d2a] p-12 text-white lg:flex lg:flex-col">
          <div className="absolute -right-20 -top-20 size-72 rounded-full border-[52px] border-[#d7f06b]/10" />
          <div className="relative flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-[#d7f06b] text-[#153d2a]"><Building2 size={22} strokeWidth={2.5}/></div><div><p className="font-semibold">PeopleCore</p><p className="text-xs text-white/55">Employee operations</p></div></div>
          <div className="relative my-auto max-w-md"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#d7f06b]">Account recovery</p><h1 className="mt-5 text-5xl font-semibold leading-[1.05] tracking-[-0.045em]">Reset your password.</h1><p className="mt-6 max-w-sm text-base leading-7 text-white/65">Enter the email tied to your account and we will send you a secure, one-time reset link.</p></div>
          <p className="relative text-xs text-white/40">Secure access for PeopleCore members</p>
        </section>

        <section className="flex min-h-[560px] items-center p-6 sm:p-12 lg:p-14">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-9 flex items-center gap-3 lg:hidden"><div className="grid size-10 place-items-center rounded-xl bg-[#173f2b] text-[#d7f06b]"><Building2 size={20}/></div><span className="font-semibold">PeopleCore</span></div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#568067]">Forgot password</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Request a reset link</h2>
            <p className="mt-2 text-sm leading-6 text-[#738078]">We will email you a link that lets you choose a new password. The link expires after one hour.</p>

            {error && <div role="alert" className="mt-5 rounded-xl border border-[#efc9c5] bg-[#fff5f3] px-4 py-3 text-sm text-[#9c3028]">{error}</div>}
            {message && <div role="status" className="mt-5 rounded-xl border border-[#bcd8c5] bg-[#eef8f1] px-4 py-3 text-sm text-[#27613b]">{message}</div>}

            <form onSubmit={submit} className="mt-7 space-y-4">
              <label className="block text-sm font-medium text-[#435047]">Email address<span className="relative mt-1.5 block"><Mail className="absolute left-3.5 top-3 text-[#87928b]" size={17}/><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-[#d5dcd7] py-2.5 pl-10 pr-3 font-normal outline-none transition focus:border-[#4c7f60] focus:ring-2 focus:ring-[#4c7f60]/15"/></span></label>
              <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#173f2b] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#24583d] disabled:cursor-wait disabled:opacity-65">{busy ? <LoaderCircle className="animate-spin" size={17}/> : <ArrowRight size={17}/>} Send reset link</button>
            </form>

            <p className="mt-8 flex items-center gap-2 text-sm text-[#6c7870]"><ArrowLeft size={15}/> <Link className="font-semibold text-[#24583d] hover:underline" href="/login">Back to sign in</Link></p>
          </div>
        </section>
      </div>
    </main>
  );
}

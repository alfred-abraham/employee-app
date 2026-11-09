import { ResetPasswordForm } from "@/components/reset-password-form";

type ResetPasswordPageProps = { searchParams: Promise<{ token?: string | string[]; error?: string | string[] }> };

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  if (params.error === "INVALID_TOKEN") {
    return <InvalidResetLink />;
  }
  if (!token) {
    return <InvalidResetLink />;
  }
  return <ResetPasswordForm token={token} />;
}

function InvalidResetLink() {
  return (
    <main className="min-h-screen bg-[#eff3f0] px-4 py-8 text-[#17221c] sm:grid sm:place-items-center sm:px-6">
      <div className="w-full max-w-md rounded-[28px] border border-[#dbe2dd] bg-white p-8 text-center shadow-[0_24px_80px_rgba(21,61,42,.12)] sm:p-12">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#568067]">Reset password</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">This reset link is invalid</h1>
        <p className="mt-3 text-sm leading-6 text-[#738078]">The link may be expired or already used. Request a fresh link and try again.</p>
        <a className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-[#173f2b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#24583d]" href="/forgot-password">Request a new link</a>
        <p className="mt-4 text-sm text-[#6c7870]">Or <a className="font-semibold text-[#24583d] hover:underline" href="/login">back to sign in</a>.</p>
      </div>
    </main>
  );
}

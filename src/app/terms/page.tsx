import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 text-slate-800">
      <Link href="/" className="text-sm font-semibold text-emerald-700 hover:underline">
        ← Employee App
      </Link>
      <article className="mt-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-500">Effective September 21, 2026</p>

        <div className="mt-8 space-y-7 leading-7">
          <section>
            <h2 className="text-xl font-semibold text-slate-950">Using Employee App</h2>
            <p className="mt-2">
              You may use Employee App only for legitimate employee-directory activities and only
              with an account you are authorized to use. You are responsible for keeping your login
              credentials secure and for activity performed through your account.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-950">Acceptable use</h2>
            <p className="mt-2">
              Do not misuse the service, attempt to bypass access controls, interfere with other
              users, upload unlawful information, or access employee information without a valid
              business purpose.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-950">Availability and changes</h2>
            <p className="mt-2">
              The service may change, be suspended, or become unavailable while maintenance or
              improvements are performed. Reasonable care is taken to keep the application secure
              and available, but uninterrupted operation is not guaranteed.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-950">Account access</h2>
            <p className="mt-2">
              Access may be suspended or removed when these terms are violated, when an account is
              no longer authorized, or when necessary to protect the service and its users.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-950">Contact</h2>
            <p className="mt-2">
              Questions about these terms can be sent to{" "}
              <a className="font-medium text-emerald-700 hover:underline" href="mailto:alfred.f.abraham@gmail.com">
                alfred.f.abraham@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}

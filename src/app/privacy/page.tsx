import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 text-slate-800">
      <Link href="/" className="text-sm font-semibold text-emerald-700 hover:underline">
        ← Employee App
      </Link>
      <article className="mt-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Effective October 3, 2026</p>

        <div className="mt-8 space-y-7 leading-7">
          <section>
            <h2 className="text-xl font-semibold text-slate-950">Information we collect</h2>
            <p className="mt-2">
              Employee App stores the name and email address associated with your account. If you
              sign in with Google, Google provides basic profile information needed to identify your
              account. The app also stores employee directory records that authorized users create
              or update. If you choose to add a profile photo or home address, the app stores
              those details too. If you upload a resume or another profile document, we store its
              contents, filename, category, file type, size, and upload date. Time away records include dates, type, and any note entered.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-950">How information is used</h2>
            <p className="mt-2">
              Account information is used only to authenticate you, maintain your session, protect
              employee data, and operate the directory, department, and time away screens. Address
              suggestions send the text you enter to Google Maps Platform. We do not sell personal information or use
              it for advertising.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-950">Storage and sharing</h2>
            <p className="mt-2">
              Data is stored in Google Cloud infrastructure. Information is shared with service
              providers only as needed to host, secure, authenticate, and provide Google Maps
              address suggestions and map previews, or when
              required by law.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-950">Profile documents</h2>
            <p className="mt-2">
              Uploading documents is optional. Document contents are stored in a private Google Cloud Storage
              bucket, with metadata in our SQL database. In-app access is limited to the account that
              uploaded them; directory roles do not give other users access. Infrastructure operators
              may access stored data only as needed to operate the service. Documents are retained until
              you remove them or your account is deleted. Failed uploads, pending removals, and documents
              belonging to deleted accounts are retried by cleanup after a one-hour grace period.
              The configured document bucket disables object versioning and soft delete so removed
              objects are not retained there; SQL backups may retain metadata under the deployment&apos;s backup policy.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-950">Your choices</h2>
            <p className="mt-2">
              You may stop using the app at any time and revoke Google account access from your
              Google Account settings. You can remove your profile photo and profile documents in the app. Contact the
              application owner to request access, correction,
              or deletion of your account data.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-950">Contact</h2>
            <p className="mt-2">
              Privacy questions can be sent to{" "}
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

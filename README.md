# PeopleCore employee app

A Next.js employee information system with email/password and Google authentication, a Backend-for-Frontend (BFF) API, PostgreSQL persistence, Drizzle schema management, and container packaging for Google Cloud.

## Architecture

```text
Browser -> Better Auth -> protected Next.js UI -> /api/employees BFF -> repository -> PostgreSQL
```

- `src/components` contains the responsive employee directory and CRUD interface.
- `src/app/api` exposes validated JSON endpoints and a database health check.
- Better Auth stores users, linked accounts, sessions, OAuth state, and rate limits in PostgreSQL.
- The directory and all employee endpoints require a valid database-backed session.
- `src/lib/employee-repository.ts` is the only application layer that queries PostgreSQL.
- `src/db/schema.ts` and `drizzle/` define the schema and migration history.
- `Dockerfile` produces a small, non-root Next.js standalone container.
- `docker-compose.yml` runs the app with PostgreSQL and includes migration/seed tools.

## Local development

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL: `docker-compose up -d db`.
3. Apply migrations: `docker-compose --profile tools run --rm migrate`.
4. Optionally add sample employees: `docker-compose --profile tools run --rm seed`.
5. Run `npm run dev` and open `http://localhost:3000`.

To run the complete container stack, use `docker-compose up --build`. A fresh PostgreSQL volume automatically applies the initial schema.

## Authentication setup

Copy the authentication settings from `.env.example` into `.env.local` for local development or your runtime secret store for production.

- `BETTER_AUTH_SECRET`: a random secret of at least 32 characters. Generate one with `openssl rand -base64 32`.
- `BETTER_AUTH_URL`: the public origin of this application, with no trailing slash (for example, `http://localhost:3000` locally or `https://employees.example.com` in production).
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: OAuth 2.0 web application credentials from Google Cloud. If omitted, email/password login remains available and the Google button is disabled.
- `RESEND_API_KEY`: server-side Resend API key for verification mail. Configure a verified sending domain in Resend.
- `VERIFICATION_EMAIL_FROM`: sender address on that verified domain, for example `PeopleCore <verify@example.com>`.

For Google login, create an OAuth 2.0 **Web application** in Google Cloud Console and configure:

- Authorized JavaScript origin: the value of `BETTER_AUTH_URL`.
- Authorized redirect URI: `<BETTER_AUTH_URL>/api/auth/callback/google`.

Run `npm run db:migrate` after pulling authentication changes. Passwords must be 12–128 characters and contain uppercase, lowercase, numeric, and symbol characters. Better Auth hashes them with salted scrypt before storing the hash in `account.password`; plaintext passwords are never stored. Email/password registration sends a one-hour, single-use verification link, and sign-in is blocked until verification. Resend is limited to three requests per hour per client by Better Auth. Registration and resend use generic completion messages so they do not disclose whether an email is registered. A Google identity with the same verified email can be linked to the existing user; unverified or different-email identities are not implicitly linked.

Set up the sender before enabling registration in production. If delivery fails after an account is created, the user can request another link from the sign-in page. Existing email/password accounts with `email_verified = false` will need to verify before their next sign-in. Existing credentials created by Better Auth remain valid; if any credentials were imported from another system, audit them before rollout and reset any whose hash format is unknown. The verification flow uses the existing `verification` table and needs no new migration.

Production deployments must provide all authentication secrets at runtime and use HTTPS. Session cookies are HTTP-only and become secure cookies in production.

## Useful checks

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `GET /api/health`

The directory API accepts `GET /api/employees?page=1&pageSize=25&search=...&department=...&status=...`. Page size defaults to 25 and is capped at 100. Search is case-insensitive across employee names (including full name), email, company, and job title. Search and department filters run in PostgreSQL before paging. The response includes the current `employees` page, `pagination` (`page`, `pageSize`, `total`, `totalPages`, `hasPrevious`, `hasNext`), organization-wide `stats`, and the complete department option list. Invalid paging or filter values return HTTP 400. The directory uses a stable last-name, first-name, ID order; page-number navigation uses offset pagination, so very deep pages may require a cursor-based follow-up if the database grows into millions of rows. Apply migration `0003_employee_directory_paging_search.sql` before deploying this change; it adds name-order and trigram search indexes.

## Profile photos and workplace maps

The profile picture dialog provides a square camera guide and a matching avatar preview. After capture or upload, adjust position, zoom, and straightening before saving. The server preserves the chosen square framing when converting it to WebP.

Select a geographic workplace location in the directory to open its Google Maps dialog. Remote and unspecified locations remain plain text. Multiple matches require a selection before displaying a marker; failed lookups and missing configuration retain an **Open in Google Maps** link. This feature only uses the directory location and never reads private home addresses.

For embedded workplace maps, configure `GOOGLE_MAPS_SERVER_KEY` with **Places API (New)** enabled (Text Search), and `GOOGLE_MAPS_EMBED_KEY` with **Maps Embed API** enabled. Keep the server key private and restrict the embed key to the application's HTTP referrers. Both keys are optional; without them the dialog provides the external Maps link. No database migration is required.

## Google Compute Engine deployment

The repository includes an idempotent Google Cloud bootstrap and release flow
for Artifact Registry, Cloud SQL, Secret Manager, a containerized Compute Engine
VM, migrations, health-checked rollback, and HTTPS load balancing. See the
[Google Compute Engine deployment guide](deploy/gcp/README.md).

Keep `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `GOOGLE_CLIENT_SECRET` in Secret Manager and grant the runtime service account access only to the versions it needs.

## User access and roles

Apply migration `0005_user_roles.sql` with `npm run db:migrate` before deploying role management. Existing accounts remain intact and are listed in the admin panel, but **all users without an explicitly assigned role now wait for approval**. No existing account is automatically promoted. Plan the first admin grant and existing-user assignments as part of rollout. Historical first/last sign-in dates are backfilled from retained sessions; dates for accounts without retained sessions appear as not recorded until their next sign-in.

Register and verify the initial administrator account, then run `npm run admin:bootstrap -- admin@example.com` from a trusted terminal with the target database's `DATABASE_URL`. The convenience script loads `.env.local`; for deployments that provide environment variables directly, use `npx tsx scripts/admin-bootstrap.ts admin@example.com`. This provisions a permanent admin for that exact verified account and records a `system:admin-bootstrap` audit event. The same command provides an operator recovery path; possession of database credentials is required, and it is never exposed through the web app.

Open `/admin/users` to search accounts and grant, edit, or revoke viewer, editor, and admin assignments. Viewer can read employees, departments, and time away. Editor can also create/update/delete employee records and manage departments and time away. Admin additionally manages account roles. A user can have multiple assignments; effective permissions combine all unexpired roles. New/unassigned users see `/access-pending`. Their own profile photo and linked home-address self-service remain available; these roles do not grant access to another user's private address.

Each role may have its own expiry date and time. The admin form uses the browser's local timezone and converts it to an absolute timestamp for PostgreSQL. An empty expiry grants access until revoked. Access stops at the expiry instant, including in existing sessions, because protected requests read current assignments from the database. The admin display refreshes expiry status periodically; use Refresh to retrieve other administrators' changes. Protected pages recheck access on navigation, and every protected API request rechecks it independently.

At least one admin must retain a role with **no expiry**. Attempts to revoke that last permanent admin or add an expiry to their assignment fail without saving. First grant another account permanent admin access. Role administration is serialized and rechecks the acting admin inside the transaction; audit entries and grants commit together. `role_audit` records the actor, target account ID, role, action, old/new expiry, and timestamp. Read this table through trusted database tooling when investigating changes. Admin/audit data is not available to viewers or editors.

To run the role API integration test, use a fresh, disposable PostgreSQL instance bound to `127.0.0.1:55439` with database `postgres` and user `role_test`; apply migrations there and start the app on `http://localhost:3107` with that test `DATABASE_URL` and `BETTER_AUTH_URL`. Set `ROLE_TEST_DATABASE_URL` and `ROLE_TEST_BASE_URL` to those same endpoints, then run `node --import tsx --test src/lib/role-integration.test.ts`. The test is skipped by the normal test command unless explicitly enabled, and rejects other database ports/users. It exercises sign-in tracking, role grants/changes/revocation, existing-session expiry, migration backfill, audit persistence, recovery, and concurrent last-admin changes.

## Profile documents

Open **My documents** to upload a PDF or DOCX resume or another document to your account profile. Uploads, listing, download, and removal are restricted to the signed-in owner, including accounts awaiting directory access. Directory/admin roles do not grant access to other accounts' documents. Photos remain independent of document storage.

Apply `0006_profile_documents.sql` with `npm run db:migrate` before using this feature. File bytes are stored in a private Google Cloud Storage bucket; PostgreSQL contains owner, filename, category, MIME type, size, SHA-256, object reference/generation, status, and timestamps. Pending reservations are created before bucket writes, and downloads only allow completed uploads. Neither SQL nor the container filesystem stores document contents.

Set `DOCUMENTS_BUCKET` to your dedicated bucket name. Defaults are 10 MiB per file, 20 documents, and 100 MiB per account. Configure `DOCUMENT_MAX_FILE_BYTES` (1–20 MiB), `DOCUMENT_MAX_COUNT` (1–100), and `DOCUMENT_MAX_TOTAL_BYTES` (1–1 GiB) in bytes/counts. The UI displays runtime limits. Pending uploads and removals count against quotas until cleaned up. Uploads use a bounded raw request body and server-side type checks; DOCX checks reject encrypted archives, macros, missing Word parts, and excessive XML expansion. These checks are not an antivirus scan. Files are served as attachments through owner-authorized endpoints; bucket paths and expiring URLs are not returned to the browser.

For local development use a **separate development bucket** with the same private access settings and your Google Application Default Credentials (`gcloud auth application-default login`), granting only object create/get/delete on that bucket. Run `npm run dev` with `DOCUMENTS_BUCKET` in `.env.local`. Missing configuration disables uploads with a clear message; no filesystem fallback is used. Docker users must explicitly supply the bucket and mount their local ADC credentials read-only outside the source tree; never put service-account keys in an image. Cloud Run uses its runtime service account automatically.

`POST /api/me/documents` accepts the raw file bytes, `Content-Type`, URI-encoded `X-Document-Name`, `X-Document-Category` (`resume`/`other`), and a UUIDv4 `Idempotency-Key`. Repeating the same completed upload key/payload returns its document without rewriting bytes. A pending key returns 409; after an interrupted upload, refresh or select the file again to start a new upload. `GET /api/me/documents` lists your documents and limits; `GET`/`DELETE /api/me/documents/<id>` download/remove. There is no browser-supplied owner or separate public completion endpoint.

Deletion first hides the document from downloads, then removes its generation from the bucket and its SQL row. Failures retain the reference for retry. Account deletion sets the owner to null rather than losing the reference. Run `npm run documents:cleanup` with `DATABASE_URL` and ADC to remove abandoned uploads, failed removals, and deleted-account objects after a one-hour grace period. Each run claims up to 100 records; run it again for a backlog. Production deployment configures an hourly Cloud Run cleanup job. Monitor failed jobs and cleanup backlog; do not delete ready-file references directly in SQL. Cleanup does not delete another owner's live documents or objects outside SQL's tracked references.

The dedicated bucket disables object versioning, soft delete, and retention locks. Setup rejects existing buckets with incompatible settings without changing their retention policy. Uploaded documents stay until removed or the account is deleted; SQL metadata may remain in Cloud SQL backups according to its backup policy. See the [GCP deployment guide](deploy/gcp/README.md) for bucket IAM and scheduled cleanup. `npm test` includes isolated embedded-PostgreSQL document migration/repository tests and simulated bucket failure recovery; it does not access live Cloud SQL or GCP storage.

## Account blocking

After applying `0007_account_blocks.sql` with `npm run db:migrate`, active admins can block and reinstate accounts under **User access**. Enter an internal reason and optionally a future expiry; leaving expiry empty blocks indefinitely. Blocking immediately removes all sessions and prevents password and Google sign-in, protected page/API access, and self-service profile access. The reason and audit history are visible only to admins. Public sign-in failures remain generic.

Blocking preserves account data and existing roles. Unblocking or expiry requires a fresh sign-in; current role assignments and their expiries still determine access. Pending users remain pending. Admins cannot block themselves, and concurrent role or block changes must retain an unblocked permanent admin. The operator bootstrap script refuses to grant admin access to an actively blocked account.

Apply the migration before deploying code that reads the block tables. Existing accounts start unblocked. No scheduler or new cloud permissions are required. Test the feature against a disposable local PostgreSQL instance with `BLOCK_TEST_DATABASE_URL=postgresql://role_test@127.0.0.1:55439/postgres` and `BLOCK_TEST_BASE_URL=http://localhost:3107`, then run `node --import tsx --test src/lib/account-block-integration.test.ts`. These tests reject other database hosts, users, and ports. Run the existing role integration suite separately against the same isolated instance.

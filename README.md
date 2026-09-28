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

## Google Compute Engine deployment

The repository includes an idempotent Google Cloud bootstrap and release flow
for Artifact Registry, Cloud SQL, Secret Manager, a containerized Compute Engine
VM, migrations, health-checked rollback, and HTTPS load balancing. See the
[Google Compute Engine deployment guide](deploy/gcp/README.md).

Keep `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `GOOGLE_CLIENT_SECRET` in Secret Manager and grant the runtime service account access only to the versions it needs.

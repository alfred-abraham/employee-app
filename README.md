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

For Google login, create an OAuth 2.0 **Web application** in Google Cloud Console and configure:

- Authorized JavaScript origin: the value of `BETTER_AUTH_URL`.
- Authorized redirect URI: `<BETTER_AUTH_URL>/api/auth/callback/google`.

Run `npm run db:migrate` after pulling authentication changes. Passwords must be 12–128 characters and contain uppercase, lowercase, numeric, and symbol characters. They are hashed by Better Auth with scrypt and are never stored in plaintext. Registration uses a generic completion response so it does not disclose whether an email is already registered. A Google identity with the same verified email is linked to the existing user; unverified or different-email identities are not implicitly linked.

Production deployments must provide all authentication secrets at runtime and use HTTPS. Session cookies are HTTP-only and become secure cookies in production.

## Useful checks

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `GET /api/health`

## Google Compute Engine deployment

The repository includes an idempotent Google Cloud bootstrap and release flow
for Artifact Registry, Cloud SQL, Secret Manager, a containerized Compute Engine
VM, migrations, health-checked rollback, and HTTPS load balancing. See the
[Google Compute Engine deployment guide](deploy/gcp/README.md).

Keep `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `GOOGLE_CLIENT_SECRET` in Secret Manager and grant the runtime service account access only to the versions it needs.

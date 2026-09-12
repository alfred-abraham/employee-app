# PeopleCore employee app

A Next.js employee information system with a Backend-for-Frontend (BFF) API, PostgreSQL persistence, Drizzle schema management, and container packaging for Google Compute Engine.

## Architecture

```text
Browser -> Next.js UI -> /api/employees BFF -> repository -> PostgreSQL
```

- `src/components` contains the responsive employee directory and CRUD interface.
- `src/app/api` exposes validated JSON endpoints and a database health check.
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

## Useful checks

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `GET /api/health`

## Google Compute Engine deployment

The repository includes an idempotent Google Cloud bootstrap and release flow
for Artifact Registry, Cloud SQL, Secret Manager, a containerized Compute Engine
VM, migrations, health-checked rollback, and HTTPS load balancing. See the
[Google Compute Engine deployment guide](deploy/gcp/README.md).

Authentication and role-based authorization should be added before exposing employee data beyond a trusted development environment.

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

Build and push the image to Artifact Registry, then run the container on a Compute Engine VM with `DATABASE_URL` supplied as a runtime secret. For production, use Cloud SQL for PostgreSQL (private IP or the Cloud SQL Auth Proxy), terminate TLS at an external Application Load Balancer, restrict port `3000` to the load balancer, and run migrations before each application rollout. Keep database credentials out of the image and VM startup script; use Secret Manager.

Authentication and role-based authorization should be added before exposing employee data beyond a trusted development environment.

# Google Cloud Run deployment

The production Next.js container runs on Cloud Run in `us-central1`. Cloud Run
connects to the existing private-IP PostgreSQL instance through the managed
Cloud SQL Unix socket and Direct VPC egress, reads a pinned database URL version
from Secret Manager, and receives public traffic only through the existing
global external HTTPS load balancer.

The load balancer preserves the static IP, Cloud DNS record, custom domain, and
Google-managed TLS certificate. Its backend is a regional serverless network
endpoint group (NEG) that targets the Cloud Run service.

## Resources

- Cloud Run service: `employee-app`
- Cloud Run migration job: `employee-app-migrate`
- Runtime service account: `employee-app-run`
- Cloud SQL instance: `employee-app-postgres`
- Cloud Run database secret: `employee-app-cloud-run-database-url`
- Better Auth secret: `employee-app-better-auth-secret`
- Google OAuth client secret: `employee-app-google-client-secret`
- Artifact Registry repository: `employee-app`
- Serverless NEG: `employee-app-cloud-run-neg`
- Global backend service: `employee-app-cloud-run-backend`
- Existing URL map, HTTPS proxy, certificate, IP, and forwarding rule

The runtime service account has Cloud SQL Client and access to only the Cloud
Run database and authentication secrets. Credentials are never passed as
command arguments, stored in images, or committed to source control.

Before the first authenticated deployment, create the Better Auth and Google
OAuth client secrets in Secret Manager. Add secret values from temporary files
or the Cloud Console so the values do not appear in shell history. Configure the
Google OAuth web client with `https://<DOMAIN>` as an authorized origin and
`https://<DOMAIN>/api/auth/callback/google` as an authorized redirect URI.

## One-time migration from Compute Engine

From the repository root, run:

```powershell
./deploy/gcp/migrate-to-cloud-run.ps1 `
  -ProjectId "employee-application-508420" `
  -Domain "employees-example.com" `
  -GoogleClientId "YOUR_GOOGLE_CLIENT_ID"
```

The command performs these operations in order:

1. Enables Cloud Run and verifies the existing Cloud SQL instance.
2. Creates the least-privilege Cloud Run service account.
3. Copies the existing database credentials into a separate Cloud Run secret
   without printing them and configures the managed Cloud SQL socket separately.
4. Builds immutable application and migration images through Cloud Build.
5. runs the migration image as a single-task Cloud Run Job.
6. Deploys Cloud Run with Direct VPC egress for private database traffic, a
   startup probe on `/api/health`, zero-to-five instances, 80-request
   concurrency, one CPU, and 512 MiB of memory.
7. Creates a serverless NEG and a separate Cloud Run backend service.
8. Atomically changes the existing URL map from the VM backend to Cloud Run.
9. Verifies HTTPS health and confirms employee data is protected by authentication.

Until retirement, restore the VM backend with:

```powershell
gcloud compute url-maps set-default-service employee-app-map `
  --global `
  --default-service=employee-app-backend `
  --project=employee-application-508420
```

After the Cloud Run cutover is verified, retire the VM-only resources:

```powershell
./deploy/gcp/retire-vm.ps1 `
  -ProjectId "employee-application-508420" `
  -Domain "employees-example.com"
```

The retirement script has a high-impact confirmation prompt and independently
checks the URL map, public health endpoint, and employee data before deletion.
It removes only the old VM, unmanaged instance group, VM backend service, health
check, firewall rule, VM database secret, and VM service account.

## Subsequent releases

After tests pass and the desired commit is checked out:

```powershell
./deploy/gcp/deploy.ps1 `
  -ProjectId "employee-application-508420" `
  -PublicUrl "https://employees-example.com" `
  -GoogleClientId "YOUR_GOOGLE_CLIENT_ID"
```

The release script builds commit-tagged images, updates and executes the
migration job, then deploys a new Cloud Run revision. Cloud Run shifts traffic
only after the revision passes its startup probe. Both the migration job and
service use the `default` network and `default` regional subnet unless
`-Network` and `-Subnet` are supplied.

To reuse images that were already published:

```powershell
./deploy/gcp/deploy.ps1 `
  -ProjectId "employee-application-508420" `
  -PublicUrl "https://employees-example.com" `
  -GoogleClientId "YOUR_GOOGLE_CLIENT_ID" `
  -Tag "COMMIT_TAG" `
  -SkipBuild
```

## Rollback

List revisions and route all service traffic to the last healthy one:

```powershell
gcloud run revisions list `
  --service=employee-app `
  --region=us-central1 `
  --project=employee-application-508420

gcloud run services update-traffic employee-app `
  --region=us-central1 `
  --project=employee-application-508420 `
  --to-revisions=PREVIOUS_REVISION=100
```

Database migrations must remain backward-compatible with the previous revision.

## Operations

Verify the public application:

```powershell
curl.exe --fail https://employees-example.com/api/health
curl.exe --include https://employees-example.com/api/employees
```

Inspect service and migration logs:

```powershell
gcloud run services logs read employee-app `
  --region=us-central1 `
  --project=employee-application-508420

gcloud run jobs executions list `
  --job=employee-app-migrate `
  --region=us-central1 `
  --project=employee-application-508420
```

Cloud SQL backups and point-in-time recovery remain enabled. Cloud Run can
scale to zero, but Cloud SQL, the external load balancer, Artifact Registry,
Cloud DNS, and the registered domain continue to incur their own charges.

## Security notes

- Ingress is restricted to `internal-and-cloud-load-balancing` and the default
  Cloud Run URL is disabled, preventing direct bypass of the load balancer.
- Public invocation is allowed only through the permitted ingress path.
- Private database traffic uses Direct VPC egress with `private-ranges-only`.
- Secret environment variables are pinned to a numeric Secret Manager version.
- Employee pages and APIs require a database-backed Better Auth session.
- `BETTER_AUTH_SECRET` and the Google client secret are pinned to numeric Secret
  Manager versions on each deployment.

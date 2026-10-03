# Google Cloud Run deployment

The production Next.js container runs on Cloud Run in `us-central1`. Cloud Run
connects to the existing private-IP PostgreSQL instance through the managed
Cloud SQL Unix socket and Direct VPC egress, reads a pinned database URL version
from Secret Manager, and receives public traffic through a direct Cloud Run
domain mapping for `employees-example.com`.

Cloud DNS publishes the A and AAAA records returned by the mapping. Cloud Run
issues and renews the domain's Google-managed HTTPS certificate. Direct domain
mapping is a Preview feature supported in `us-central1`; Google does not
recommend it for production because of latency limitations.

## Resources

- Cloud Run service: `employee-app`
- Cloud Run migration job: `employee-app-migrate`
- Runtime service account: `employee-app-run`
- Cloud SQL instance: `employee-app-postgres`
- Cloud Run database secret: `employee-app-cloud-run-database-url`
- Better Auth secret: `employee-app-better-auth-secret`
- Google OAuth client secret: `employee-app-google-client-secret`
- Resend API key: `employee-app-resend-api-key`
- Google Places server key: `employee-app-google-maps-server-key`
- Google Maps Embed browser key: `employee-app-google-maps-embed-key`
- Artifact Registry repository: `employee-app`
- Cloud Run domain mapping: `employees-example.com`
- Cloud DNS zone: `employees-example-com`

The runtime service account has Cloud SQL Client and access to only the Cloud
Run database and authentication secrets. Credentials are never passed as
command arguments, stored in images, or committed to source control.

The address screen uses Places API (New) for suggestions and Maps Embed API for
the selected location. Enable both APIs and create separate API keys. Restrict
the Places key to `places.googleapis.com`; keep it server-side. Restrict the
Embed key to `maps-embed-backend.googleapis.com` and the production HTTPS
referrer `https://employees-example.com/*`. Save the keys as the two Secret
Manager secrets above before running the release script. The Embed key is
delivered to signed-in browsers for map previews; referrer and API restrictions
protect its use. Configure API quotas to cap Google Maps costs.

Before the first authenticated deployment, create the Better Auth, Google
OAuth client, and Resend API key secrets in Secret Manager. Add secret values from temporary files
or the Cloud Console so the values do not appear in shell history. Configure the
Google OAuth web client with `https://<DOMAIN>` as an authorized origin and
`https://<DOMAIN>/api/auth/callback/google` as an authorized redirect URI.

## One-time migration from Compute Engine

This section documents the historical VM-to-load-balancer migration. It is
not needed for subsequent releases using the direct domain mapping. This
script explicitly selects `internal-and-cloud-load-balancing` ingress;
ordinary releases default to `all` ingress for direct domain traffic.

From the repository root, run:

```powershell
./deploy/gcp/migrate-to-cloud-run.ps1 `
  -ProjectId "employee-application-508420" `
  -Domain "employees-example.com" `
  -GoogleClientId "YOUR_GOOGLE_CLIENT_ID" `
  -VerificationEmailFrom "PeopleCore <verify@your-verified-domain.com>"
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

### Direct custom-domain routing

The `employees-example.com` mapping targets `employee-app` in `us-central1`.
The Cloud DNS apex records are:

- A: `216.239.32.21`, `216.239.34.21`, `216.239.36.21`, `216.239.38.21`
- AAAA: `2001:4860:4802:32::15`, `2001:4860:4802:34::15`,
  `2001:4860:4802:36::15`, `2001:4860:4802:38::15`

These records were returned by Cloud Run for this mapping; retrieve the
mapping's current `status.resourceRecords` before recreating or changing DNS.
The record TTL is 300 seconds. Email-related DNS records are independent.

For a new mapping, enable the default Cloud Run URL during initial setup to
avoid Google's documented mapping issue. Disable it after the custom-domain
certificate is ready and HTTPS health and authentication checks pass. Keep
`BETTER_AUTH_URL` and Google OAuth callbacks on the custom domain.

Ordinary releases preserve the mapping and deploy with `-Ingress all` by
default. Use `-Ingress internal-and-cloud-load-balancing` only when deploying
behind a load balancer. Do not run the historical migration script on this
direct-domain deployment.

### Release commands

After tests pass and the desired commit is checked out:

```powershell
./deploy/gcp/deploy.ps1 `
  -ProjectId "employee-application-508420" `
  -PublicUrl "https://employees-example.com" `
  -GoogleClientId "YOUR_GOOGLE_CLIENT_ID" `
  -VerificationEmailFrom "PeopleCore <verify@your-verified-domain.com>"
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

To populate a paging demo, run `npm run db:seed-demo` with
`SEED_DEMO_EMPLOYEES=yes` and the same database connection settings used by the
migration job. This adds up to 225 synthetic employees with `DEMO-` employee
numbers and `example.invalid` addresses. Repeating the command does not add
duplicates and refreshes the varied synthetic names. The original directory
data is preserved.

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

Verify Cloud SQL backup and point-in-time recovery settings in the live
instance; the deployment script does not configure them. Cloud Run can scale
to zero, but Cloud SQL, Artifact Registry, Cloud DNS, and the registered domain
continue to incur their own charges.

The optional [Cloud SQL idle controller](sql-idle-controller/README.md) checks
every minute, stops the database after confirmed inactivity, and starts it
when application traffic returns. Pause that scheduler and start Cloud SQL
before running migrations or performing database maintenance. Returning users
may see errors while a stopped database starts.

## Security notes

- Ingress is `all` to allow direct custom-domain traffic. The default Cloud Run
  URL remains disabled; public invocation through the mapped domain is allowed.
- Private database traffic uses Direct VPC egress with `private-ranges-only`.
- Secret environment variables are pinned to a numeric Secret Manager version.
- Employee pages and APIs require a database-backed Better Auth session.
- `BETTER_AUTH_SECRET` and the Google client secret are pinned to numeric Secret
  Manager versions on each deployment.

## Profile document storage

Ordinary `deploy.ps1` releases now create/verify a dedicated document bucket, apply migration `0006_profile_documents.sql`, and configure the runtime and an hourly cleanup job. The default bucket is `<ProjectId>-<ServiceName>-documents`; override with `-DocumentsBucket`. Optional `-DocumentMaxFileBytes`, `-DocumentMaxCount`, and `-DocumentMaxTotalBytes` control the upload limits (10 MiB, 20 files, 100 MiB per account by default). The runtime receives these as `DOCUMENTS_BUCKET` and `DOCUMENT_MAX_*` environment variables. The historical VM migration delegates to the same release script.

`setup-documents.ps1` creates the bucket in the deployment region with uniform bucket-level access and enforced public access prevention, with soft delete disabled and versioning off. It verifies the bucket belongs to the selected project and rejects incompatible existing retention/versioning settings. Use a dedicated bucket; do not reuse employee photos or other application buckets. No public ACL, browser CORS, signed URL permission, service-account key, or filesystem volume is needed. See Google's [bucket creation reference](https://docs.cloud.google.com/sdk/gcloud/reference/storage/buckets/create) and [public access prevention guide](https://docs.cloud.google.com/storage/docs/public-access-prevention).

The custom `employeeAppDocumentObjects` role has only `storage.objects.create`, `storage.objects.get`, and `storage.objects.delete`, bound to this bucket for the runtime service account. The deployer needs storage bucket administration, project custom-role creation, service-account administration, Cloud Scheduler administration, and permission to act as the scheduler identity in addition to the existing release permissions. An existing custom role should have exactly those object permissions; review it before reuse.

The `employee-app-documents-cleanup` Cloud Run Job uses the tools image, runtime identity, Cloud SQL connection, and database secret, and runs `npm run documents:cleanup`. Cloud Scheduler calls the job hourly in UTC using the dedicated `employee-app-doc-cleanup` identity, which has `roles/run.invoker` only on the cleanup job. Authentication uses an OAuth token for the Google API endpoint ([Cloud Scheduler HTTP authentication](https://docs.cloud.google.com/scheduler/docs/http-target-auth)). No unauthenticated cleanup endpoint is added to the application.

To run cleanup manually:

```powershell
gcloud run jobs execute employee-app-documents-cleanup --project=YOUR_PROJECT --region=us-central1 --wait
gcloud scheduler jobs describe employee-app-documents-cleanup --project=YOUR_PROJECT --location=us-central1
```

Cleanup claims at most 100 eligible SQL rows per run with a one-hour grace/lease, skips live completed uploads, and retries failures in later runs. A deleted account leaves its object references available for cleanup. Alert on job failures and a growing backlog; run additional executions when needed. Removing an object deletes the tracked generation, and successful deletion removes its metadata row. Cloud SQL backups retain metadata according to the instance's independently configured backup policy. Avoid bucket lifecycle rules that remove active documents behind SQL's references.

After rollout, verify upload/download/removal with a disposable document, refresh/sign-in persistence, another user's access denial, private bucket access denial, and a successful manual cleanup run. Cloud deployment is separate from local tests; the automated document tests use embedded PostgreSQL and a simulated bucket, not live GCP resources.

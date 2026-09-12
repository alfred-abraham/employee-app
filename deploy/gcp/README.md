# Google Compute Engine deployment

This deployment runs the production Next.js image and Cloud SQL Auth Proxy as
containers on a Container-Optimized OS Compute Engine VM. PostgreSQL runs in
Cloud SQL, the database URL is read from Secret Manager at boot, images are
stored in Artifact Registry, and an external Application Load Balancer is the
only network path to application port `3000`.

## What the automation creates

- An Artifact Registry Docker repository and a dedicated least-privilege Cloud
  Build service account for the release pipeline.
- A Cloud SQL for PostgreSQL 17 instance with automated backups, seven retained
  backups, storage auto-growth, and point-in-time recovery.
- A dedicated VM service account with Artifact Registry Reader, Cloud SQL
  Client, Secret Manager Secret Accessor, log writer, and metric writer roles.
- A Container-Optimized OS VM that starts the Auth Proxy, applies migrations,
  starts the app, and rolls back the app container after a failed health check.
- A global external HTTPS load balancer with a Google-managed certificate.
- A firewall rule that permits port `3000` only from Google load balancer and
  health-check address ranges.

The database credential is never committed, built into an image, or stored in
VM metadata. The bootstrap command prompts for it and writes the resulting
`DATABASE_URL` to Secret Manager.

## Prerequisites

1. A Google Cloud project with billing enabled and permission to create IAM,
   Compute Engine, Cloud SQL, Secret Manager, Artifact Registry, Cloud Build,
   load-balancing, and DNS resources.
2. A domain name whose DNS records you control.
3. The [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) installed,
   followed by `gcloud auth login`.
4. PowerShell 7 or Windows PowerShell 5.1.

Cloud resources incur charges. Review the selected Cloud SQL and VM sizes before
running the command.

## First deployment

From the repository root:

```powershell
./deploy/gcp/bootstrap.ps1 `
  -ProjectId "YOUR_PROJECT_ID" `
  -Domain "employees.example.com" `
  -Region "us-central1" `
  -Zone "us-central1-a"
```

The command prints the load balancer IP. Create an `A` record for the supplied
domain pointing to that IP. Certificate provisioning can take several minutes
after DNS propagates. Check it with:

```powershell
gcloud compute ssl-certificates describe employee-app-certificate `
  --global --project YOUR_PROJECT_ID
```

The bootstrap is safe to rerun. It reuses existing named resources, rotates the
database secret to the supplied password, builds a new immutable image tag, and
keeps the firewall restricted to the load balancer.

## Subsequent releases

After tests pass and the desired Git commit is checked out:

```powershell
./deploy/gcp/deploy.ps1 `
  -ProjectId "YOUR_PROJECT_ID" `
  -Zone "us-central1-a"
```

Cloud Build publishes both the minimal application image and a tools image.
The VM restarts, pulls those exact commit-tagged images, starts the Auth Proxy,
and applies all unapplied migrations before replacing the running app. A failed
migration aborts the rollout; a failed `/api/health` check restores the previous
app container.

To roll back later to images from a previously deployed commit, reuse their tag
without rebuilding the current checkout:

```powershell
./deploy/gcp/deploy.ps1 `
  -ProjectId "YOUR_PROJECT_ID" `
  -Zone "us-central1-a" `
  -Tag "PREVIOUS_COMMIT_TAG" `
  -SkipBuild
```

## Operations

Inspect startup and application logs:

```powershell
gcloud compute ssh employee-app --zone us-central1-a --project YOUR_PROJECT_ID `
  --command "sudo journalctl -u google-startup-scripts.service -n 200"

gcloud compute ssh employee-app --zone us-central1-a --project YOUR_PROJECT_ID `
  --command "docker logs employee-app"

gcloud compute ssh employee-app --zone us-central1-a --project YOUR_PROJECT_ID `
  --command "docker logs employee-cloud-sql-proxy"
```

Verify health through the load balancer:

```powershell
curl.exe --fail https://employees.example.com/api/health
```

Cloud SQL backups and point-in-time recovery are enabled by bootstrap. Periodic
restore tests should be performed in a separate Cloud SQL instance; a backup is
not fully validated until it has been restored and the application health check
passes against it.

## Security and production follow-ups

- The VM has a public address so it can reach Artifact Registry and Google APIs,
  but no ingress rule exposes it directly. For a fully private VM, add Cloud NAT
  and Private Google Access, then recreate the VM without an external address.
- The Auth Proxy authenticates with the VM service account and encrypts the
  connection to Cloud SQL. The database still uses its dedicated password from
  Secret Manager.
- This is a single-VM deployment. For higher availability, replace the unmanaged
  group with a regional managed instance group and configure autoscaling and
  autohealing. Multiple Next.js instances also require shared cache coordination
  and a consistent Server Actions encryption key.
- Add application authentication and authorization before making employee data
  available outside a trusted environment.

## Teardown

If this app has its own Google Cloud project, deleting that project is the most
reliable teardown because it also removes dependent resources and stops billing.
For a shared project, delete the resources in this order: forwarding rule
`employee-app-https`, HTTPS proxy `employee-app-https-proxy`, certificate
`employee-app-certificate`, URL map `employee-app-map`, backend service
`employee-app-backend`, health check `employee-app-health`, instance group
`employee-app-backends`, VM `employee-app`, firewall rule
`employee-app-allow-load-balancer`, global address `employee-app-ip`, Cloud SQL
instance `employee-app-postgres`, secret `employee-app-database-url`, Artifact
Registry repository `employee-app`, and the `employee-app-vm` and
`employee-app-build` service accounts. Cloud SQL deletion is irreversible; make
and verify a final backup or export first.

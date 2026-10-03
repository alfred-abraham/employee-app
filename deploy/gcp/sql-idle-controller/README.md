# Cloud SQL idle shutdown

This controller manages `employee-app-postgres` in project
`employee-application-508420`. Cloud Scheduler job `employee-app-sql-idle`
invokes authenticated Cloud Run service `employee-app-sql-idle` every minute
in `us-central1`.

It stops Cloud SQL only when connection metrics confirm at least 15 continuous
minutes with zero connections to `employee_app`, no other user database has
connections, and there are no recent requests to Cloud Run `employee-app`.
Cloud SQL's internal `cloudsqladmin` connections are excluded. Open pooled
connections count as activity. Monitoring samples and a three-minute delay
allowance mean shutdown usually happens about 18–20 minutes after activity.
Missing, stale, or gapped connection metrics keep the instance running.

Any app request, including health checks, bots, failed sign-ins, and errors,
counts as activity. Continuous traffic can therefore prevent shutdown. This
uses sampled connections and completed request logs, so a very short query
between samples or a request starting during the stop decision can be missed.

After shutdown, a request logged by `employee-app` within the last five minutes
causes the next scheduler invocation to set activation policy to `ALWAYS`.
The first request may fail, and restarting Cloud SQL can take several minutes.
Cloud Run startup probes and the controller do not connect to the database.
Storage charges continue while Cloud SQL is stopped.

The controller account `employee-app-sql-idle` has a custom role containing
only `cloudsql.instances.get` and `cloudsql.instances.update`, conditioned on
the exact `employee-app-postgres` resource and SQL Admin service. It also has
read-only Monitoring and Logging roles. It has no database credentials or
Secret Manager access. Account `employee-app-sql-scheduler` has Cloud Run
Invoker on this controller only. No unauthenticated invoker is granted.

## Check status and logs

```powershell
gcloud scheduler jobs describe employee-app-sql-idle --project=employee-application-508420 --location=us-central1
gcloud sql instances describe employee-app-postgres --project=employee-application-508420 --format="yaml(state,settings.activationPolicy)"
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="employee-app-sql-idle"' --project=employee-application-508420 --limit=20 --format=json
```

Controller decision logs contain `action`: `skip`, `start`, `stop`, or
`would-start` / `would-stop` when `DRY_RUN=true`. API errors return HTTP 503
so Cloud Scheduler can retry. A skipped action returns HTTP 200.

## Disable automatic shutdown or manually start

Pause the scheduler first when performing database maintenance, migrations,
manual administration, or deliberately keeping the database stopped:

```powershell
gcloud scheduler jobs pause employee-app-sql-idle --project=employee-application-508420 --location=us-central1
gcloud sql instances patch employee-app-postgres --project=employee-application-508420 --activation-policy=ALWAYS --quiet
```

Resume automation afterward:

```powershell
gcloud scheduler jobs resume employee-app-sql-idle --project=employee-application-508420 --location=us-central1
```

## Test and update the controller

From the repository root:

```powershell
node --test deploy/gcp/sql-idle-controller/controller.test.mjs
gcloud builds submit deploy/gcp/sql-idle-controller --project=employee-application-508420 --service-account=projects/employee-application-508420/serviceAccounts/employee-app-build@employee-application-508420.iam.gserviceaccount.com --config=deploy/gcp/sql-idle-controller/cloudbuild.yaml --substitutions=_IMAGE=us-central1-docker.pkg.dev/employee-application-508420/employee-app/sql-idle-controller:NEW_TAG
gcloud run services update employee-app-sql-idle --project=employee-application-508420 --region=us-central1 --image=us-central1-docker.pkg.dev/employee-application-508420/employee-app/sql-idle-controller:NEW_TAG --update-env-vars=DRY_RUN=true
gcloud scheduler jobs run employee-app-sql-idle --project=employee-application-508420 --location=us-central1
```

Review decision logs before enabling writes with
`gcloud run services update employee-app-sql-idle --project=employee-application-508420 --region=us-central1 --update-env-vars=DRY_RUN=false`.

The dedicated controller uses Node's built-in HTTP and fetch implementations;
there are no installed npm dependencies. No application redeploy is required.

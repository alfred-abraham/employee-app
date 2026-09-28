[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $ProjectId,
  [string] $Region = "us-central1",
  [string] $ServiceName = "employee-app",
  [string] $MigrationJobName = "employee-app-migrate",
  [string] $SqlInstance = "employee-app-postgres",
  [string] $Repository = "employee-app",
  [string] $RuntimeServiceAccountName = "employee-app-run",
  [string] $BuildServiceAccountName = "employee-app-build",
  [string] $Network = "default",
  [string] $Subnet = "default",
  [string] $SecretName = "employee-app-cloud-run-database-url",
  [string] $AuthSecretName = "employee-app-better-auth-secret",
  [string] $GoogleClientSecretName = "employee-app-google-client-secret",
  [string] $EmailApiSecretName = "employee-app-resend-api-key",
  [string] $MapsServerSecretName = "employee-app-google-maps-server-key",
  [string] $MapsEmbedSecretName = "employee-app-google-maps-embed-key",
  [Parameter(Mandatory)] [string] $VerificationEmailFrom,
  [Parameter(Mandatory)] [ValidatePattern('^https://')] [string] $PublicUrl,
  [Parameter(Mandatory)] [string] $GoogleClientId,
  [string] $Tag = (git rev-parse --short HEAD),
  [switch] $SkipBuild
)

$ErrorActionPreference = "Stop"

function Invoke-Gcloud {
  param([Parameter(ValueFromRemainingArguments)] [string[]] $Arguments)
  & gcloud @Arguments
  if ($LASTEXITCODE -ne 0) { throw "A gcloud command failed. Review the command output above." }
}

function Read-GcloudValue {
  param([Parameter(ValueFromRemainingArguments)] [string[]] $Arguments)
  $Value = (& gcloud @Arguments)
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($Value)) {
    throw "Unable to read a required Google Cloud value."
  }
  return $Value.Trim()
}

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw "Google Cloud CLI (gcloud) is required. See deploy/gcp/README.md."
}
if (-not (Test-Path "deploy/gcp/cloudbuild.yaml")) { throw "Run this command from the repository root." }

$RuntimeServiceAccount = "$RuntimeServiceAccountName@$ProjectId.iam.gserviceaccount.com"
$BuildServiceAccount = "projects/$ProjectId/serviceAccounts/$BuildServiceAccountName@$ProjectId.iam.gserviceaccount.com"
$AppImage = "$Region-docker.pkg.dev/$ProjectId/$Repository/employee-app:$Tag"
$MigrationImage = "$Region-docker.pkg.dev/$ProjectId/$Repository/employee-app-migrate:$Tag"
$ConnectionName = Read-GcloudValue sql instances describe $SqlInstance --project=$ProjectId --format="value(connectionName)"
$SecretVersion = Read-GcloudValue secrets versions list $SecretName --project=$ProjectId --filter="state=ENABLED" --sort-by="~createTime" --limit=1 --format="value(name)"
$SecretReference = "$SecretName`:$SecretVersion"
$AuthSecretVersion = Read-GcloudValue secrets versions list $AuthSecretName --project=$ProjectId --filter="state=ENABLED" --sort-by="~createTime" --limit=1 --format="value(name)"
$AuthSecretReference = "$AuthSecretName`:$AuthSecretVersion"
$GoogleClientSecretVersion = Read-GcloudValue secrets versions list $GoogleClientSecretName --project=$ProjectId --filter="state=ENABLED" --sort-by="~createTime" --limit=1 --format="value(name)"
$GoogleClientSecretReference = "$GoogleClientSecretName`:$GoogleClientSecretVersion"
$EmailApiSecretVersion = Read-GcloudValue secrets versions list $EmailApiSecretName --project=$ProjectId --filter="state=ENABLED" --sort-by="~createTime" --limit=1 --format="value(name)"
$EmailApiSecretReference = "$EmailApiSecretName`:$EmailApiSecretVersion"
$MapsServerSecretVersion = Read-GcloudValue secrets versions list $MapsServerSecretName --project=$ProjectId --filter="state=ENABLED" --sort-by="~createTime" --limit=1 --format="value(name)"
$MapsServerSecretReference = "$MapsServerSecretName`:$MapsServerSecretVersion"
$MapsEmbedSecretVersion = Read-GcloudValue secrets versions list $MapsEmbedSecretName --project=$ProjectId --filter="state=ENABLED" --sort-by="~createTime" --limit=1 --format="value(name)"
$MapsEmbedSecretReference = "$MapsEmbedSecretName`:$MapsEmbedSecretVersion"

Invoke-Gcloud secrets add-iam-policy-binding $AuthSecretName --project=$ProjectId --member="serviceAccount:$RuntimeServiceAccount" --role=roles/secretmanager.secretAccessor --quiet
Invoke-Gcloud secrets add-iam-policy-binding $GoogleClientSecretName --project=$ProjectId --member="serviceAccount:$RuntimeServiceAccount" --role=roles/secretmanager.secretAccessor --quiet
Invoke-Gcloud secrets add-iam-policy-binding $EmailApiSecretName --project=$ProjectId --member="serviceAccount:$RuntimeServiceAccount" --role=roles/secretmanager.secretAccessor --quiet
Invoke-Gcloud secrets add-iam-policy-binding $MapsServerSecretName --project=$ProjectId --member="serviceAccount:$RuntimeServiceAccount" --role=roles/secretmanager.secretAccessor --quiet
Invoke-Gcloud secrets add-iam-policy-binding $MapsEmbedSecretName --project=$ProjectId --member="serviceAccount:$RuntimeServiceAccount" --role=roles/secretmanager.secretAccessor --quiet

if (-not $SkipBuild) {
  Write-Host "Building and publishing $Tag through Cloud Build..."
  Invoke-Gcloud builds submit --project=$ProjectId --service-account=$BuildServiceAccount --config=deploy/gcp/cloudbuild.yaml --substitutions="_REGION=$Region,_REPOSITORY=$Repository,_TAG=$Tag" .
} else {
  Write-Host "Reusing previously published images tagged $Tag..."
}

Write-Host "Deploying the migration job..."
Invoke-Gcloud run jobs deploy $MigrationJobName `
  --project=$ProjectId `
  --region=$Region `
  --image=$MigrationImage `
  --service-account=$RuntimeServiceAccount `
  --network=$Network `
  --subnet=$Subnet `
  --vpc-egress=private-ranges-only `
  --set-cloudsql-instances=$ConnectionName `
  --set-secrets="DATABASE_URL=$SecretReference" `
  --set-env-vars="DATABASE_SOCKET_PATH=/cloudsql/$ConnectionName" `
  --command=npm `
  --args="run,db:migrate" `
  --tasks=1 `
  --max-retries=0 `
  --task-timeout=10m `
  --cpu=1 `
  --memory=512Mi `
  --quiet

Write-Host "Applying database migrations before the service rollout..."
Invoke-Gcloud run jobs execute $MigrationJobName --project=$ProjectId --region=$Region --wait

Write-Host "Deploying Cloud Run revision $Tag..."
Invoke-Gcloud run deploy $ServiceName `
  --project=$ProjectId `
  --region=$Region `
  --image=$AppImage `
  --service-account=$RuntimeServiceAccount `
  --network=$Network `
  --subnet=$Subnet `
  --vpc-egress=private-ranges-only `
  --set-cloudsql-instances=$ConnectionName `
  --set-secrets="DATABASE_URL=$SecretReference,BETTER_AUTH_SECRET=$AuthSecretReference,GOOGLE_CLIENT_SECRET=$GoogleClientSecretReference,RESEND_API_KEY=$EmailApiSecretReference,GOOGLE_MAPS_SERVER_KEY=$MapsServerSecretReference,GOOGLE_MAPS_EMBED_KEY=$MapsEmbedSecretReference" `
  --set-env-vars="DATABASE_SOCKET_PATH=/cloudsql/$ConnectionName,BETTER_AUTH_URL=$PublicUrl,GOOGLE_CLIENT_ID=$GoogleClientId,VERIFICATION_EMAIL_FROM=$VerificationEmailFrom" `
  --port=3000 `
  --ingress=internal-and-cloud-load-balancing `
  --allow-unauthenticated `
  --no-default-url `
  --min-instances=0 `
  --max-instances=5 `
  --concurrency=80 `
  --cpu=1 `
  --memory=512Mi `
  --timeout=60s `
  --startup-probe="httpGet.path=/api/health,httpGet.port=3000,initialDelaySeconds=0,timeoutSeconds=5,periodSeconds=5,failureThreshold=12" `
  --deploy-health-check `
  --labels="application=employee-app,environment=production" `
  --quiet

$ReadyRevision = Read-GcloudValue run services describe $ServiceName --project=$ProjectId --region=$Region --format="value(status.latestReadyRevisionName)"
Write-Host "Cloud Run revision $ReadyRevision is ready."
Write-Host "Rollback with: gcloud run services update-traffic $ServiceName --region=$Region --project=$ProjectId --to-revisions=PREVIOUS_REVISION=100"

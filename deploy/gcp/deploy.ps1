[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $ProjectId,
  [string] $Region = "us-central1",
  [string] $ServiceName = "employee-app",
  [string] $MigrationJobName = "employee-app-migrate",
  [string] $DocumentCleanupJobName = "employee-app-documents-cleanup",
  [string] $DocumentsBucket = "",
  [ValidateRange(1, 20971520)] [int] $DocumentMaxFileBytes = 10485760,
  [ValidateRange(1, 100)] [int] $DocumentMaxCount = 20,
  [ValidateRange(1, 1073741824)] [int] $DocumentMaxTotalBytes = 104857600,
  [string] $SqlInstance = "employee-app-postgres",
  [string] $Repository = "employee-app",
  [string] $RuntimeServiceAccountName = "employee-app-run",
  [string] $BuildServiceAccountName = "employee-app-build",
  [string] $Network = "default",
  [string] $Subnet = "default",
  [ValidateSet("all", "internal-and-cloud-load-balancing")]
  [string] $Ingress = "all",
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
if (-not $DocumentsBucket) { $DocumentsBucket = "$ProjectId-$ServiceName-documents" }
& ./deploy/gcp/setup-documents.ps1 -ProjectId $ProjectId -BucketName $DocumentsBucket -Region $Region -RuntimeServiceAccountName $RuntimeServiceAccountName
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

Write-Host "Configuring profile document cleanup..."
Invoke-Gcloud run jobs deploy $DocumentCleanupJobName `
  --project=$ProjectId --region=$Region --image=$MigrationImage `
  --service-account=$RuntimeServiceAccount --network=$Network --subnet=$Subnet `
  --vpc-egress=private-ranges-only --set-cloudsql-instances=$ConnectionName `
  --set-secrets="DATABASE_URL=$SecretReference" `
  --set-env-vars="DATABASE_SOCKET_PATH=/cloudsql/$ConnectionName,DOCUMENTS_BUCKET=$DocumentsBucket" `
  --command=npm --args="run,documents:cleanup" --tasks=1 --max-retries=1 `
  --task-timeout=10m --cpu=1 --memory=512Mi --quiet
$CleanupCallerName = "employee-app-doc-cleanup"
$CleanupCaller = "$CleanupCallerName@$ProjectId.iam.gserviceaccount.com"
& gcloud iam service-accounts describe $CleanupCaller --project=$ProjectId *> $null
if ($LASTEXITCODE -ne 0) { Invoke-Gcloud iam service-accounts create $CleanupCallerName --display-name="Document cleanup scheduler" --project=$ProjectId }
Invoke-Gcloud run jobs add-iam-policy-binding $DocumentCleanupJobName --project=$ProjectId --region=$Region --member="serviceAccount:$CleanupCaller" --role=roles/run.invoker --quiet
$CleanupScheduleName = "$ServiceName-documents-cleanup"
$CleanupUri = "https://run.googleapis.com/v2/projects/$ProjectId/locations/$Region/jobs/$DocumentCleanupJobName`:run"
& gcloud scheduler jobs describe $CleanupScheduleName --project=$ProjectId --location=$Region *> $null
$CleanupScheduleMode = if ($LASTEXITCODE -eq 0) { "update" } else { "create" }
Invoke-Gcloud scheduler jobs $CleanupScheduleMode http $CleanupScheduleName `
  --project=$ProjectId --location=$Region --schedule="0 * * * *" --time-zone=UTC `
  --uri=$CleanupUri --http-method=POST --oauth-service-account-email=$CleanupCaller `
  --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform" `
  --headers="Content-Type=application/json" --message-body="{}" --quiet

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
  --set-env-vars="DATABASE_SOCKET_PATH=/cloudsql/$ConnectionName,BETTER_AUTH_URL=$PublicUrl,GOOGLE_CLIENT_ID=$GoogleClientId,VERIFICATION_EMAIL_FROM=$VerificationEmailFrom,DOCUMENTS_BUCKET=$DocumentsBucket,DOCUMENT_MAX_FILE_BYTES=$DocumentMaxFileBytes,DOCUMENT_MAX_COUNT=$DocumentMaxCount,DOCUMENT_MAX_TOTAL_BYTES=$DocumentMaxTotalBytes" `
  --port=3000 `
  --ingress=$Ingress `
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

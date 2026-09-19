[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $ProjectId,
  [Parameter(Mandatory)] [string] $Domain,
  [string] $Region = "us-central1",
  [string] $ServiceName = "employee-app",
  [string] $SqlInstance = "employee-app-postgres",
  [string] $Repository = "employee-app",
  [string] $RuntimeServiceAccountName = "employee-app-run",
  [string] $BuildServiceAccountName = "employee-app-build",
  [string] $VmSecretName = "employee-app-database-url",
  [string] $CloudRunSecretName = "employee-app-cloud-run-database-url",
  [string] $ServerlessNegName = "employee-app-cloud-run-neg",
  [string] $CloudRunBackendName = "employee-app-cloud-run-backend",
  [string] $UrlMapName = "employee-app-map",
  [string] $Tag = (git rev-parse --short HEAD),
  [switch] $SkipBuild
)

$ErrorActionPreference = "Stop"

function Invoke-Gcloud {
  param([Parameter(ValueFromRemainingArguments)] [string[]] $Arguments)
  & gcloud @Arguments
  if ($LASTEXITCODE -ne 0) { throw "A gcloud command failed. Review the command output above." }
}

function Test-Gcloud {
  param([Parameter(ValueFromRemainingArguments)] [string[]] $Arguments)
  & gcloud @Arguments *> $null
  return $LASTEXITCODE -eq 0
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
if (-not (Test-Path "deploy/gcp/deploy.ps1")) { throw "Run this command from the repository root." }

$RuntimeServiceAccount = "$RuntimeServiceAccountName@$ProjectId.iam.gserviceaccount.com"
$ConnectionName = Read-GcloudValue sql instances describe $SqlInstance --project=$ProjectId --format="value(connectionName)"

Invoke-Gcloud config set project $ProjectId
Invoke-Gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com compute.googleapis.com iam.googleapis.com secretmanager.googleapis.com sqladmin.googleapis.com

if (-not (Test-Gcloud iam service-accounts describe $RuntimeServiceAccount --project=$ProjectId)) {
  Invoke-Gcloud iam service-accounts create $RuntimeServiceAccountName --display-name="Employee app Cloud Run" --project=$ProjectId
}
Invoke-Gcloud projects add-iam-policy-binding $ProjectId --member="serviceAccount:$RuntimeServiceAccount" --role=roles/cloudsql.client --quiet

# Derive a socket-based URL without printing or placing credentials in command
# history. The VM secret remains untouched until post-cutover retirement.
$VmDatabaseUrl = Read-GcloudValue secrets versions access latest --secret=$VmSecretName --project=$ProjectId
$ParsedDatabaseUrl = [Uri]$VmDatabaseUrl
if (-not $ParsedDatabaseUrl.UserInfo -or -not $ParsedDatabaseUrl.AbsolutePath) {
  throw "The existing database URL does not contain the expected credentials and database name."
}
$CloudRunDatabaseUrl = "$($ParsedDatabaseUrl.Scheme)://$($ParsedDatabaseUrl.UserInfo)@127.0.0.1:5432$($ParsedDatabaseUrl.AbsolutePath)"
$SecretFile = New-TemporaryFile
try {
  [IO.File]::WriteAllText($SecretFile.FullName, $CloudRunDatabaseUrl, [Text.UTF8Encoding]::new($false))
  if (-not (Test-Gcloud secrets describe $CloudRunSecretName --project=$ProjectId)) {
    Invoke-Gcloud secrets create $CloudRunSecretName --replication-policy=automatic --project=$ProjectId
  }
  $CurrentCloudRunDatabaseUrl = $null
  if (Test-Gcloud secrets versions access latest --secret=$CloudRunSecretName --project=$ProjectId) {
    $CurrentCloudRunDatabaseUrl = (& gcloud secrets versions access latest --secret=$CloudRunSecretName --project=$ProjectId)
  }
  if ($CurrentCloudRunDatabaseUrl -ne $CloudRunDatabaseUrl) {
    Invoke-Gcloud secrets versions add $CloudRunSecretName --data-file=$($SecretFile.FullName) --project=$ProjectId
  }
  Invoke-Gcloud secrets add-iam-policy-binding $CloudRunSecretName --project=$ProjectId --member="serviceAccount:$RuntimeServiceAccount" --role=roles/secretmanager.secretAccessor
} finally {
  Remove-Item -LiteralPath $SecretFile.FullName -Force
  $VmDatabaseUrl = $null
  $CloudRunDatabaseUrl = $null
  $CurrentCloudRunDatabaseUrl = $null
}

$DeployParameters = @{
  ProjectId = $ProjectId
  Region = $Region
  ServiceName = $ServiceName
  SqlInstance = $SqlInstance
  Repository = $Repository
  RuntimeServiceAccountName = $RuntimeServiceAccountName
  BuildServiceAccountName = $BuildServiceAccountName
  SecretName = $CloudRunSecretName
  Tag = $Tag
  SkipBuild = $SkipBuild
}
& ./deploy/gcp/deploy.ps1 @DeployParameters
if (-not $?) { throw "Cloud Run deployment failed." }

if (-not (Test-Gcloud compute network-endpoint-groups describe $ServerlessNegName --region=$Region --project=$ProjectId)) {
  Invoke-Gcloud compute network-endpoint-groups create $ServerlessNegName --project=$ProjectId --region=$Region --network-endpoint-type=serverless --cloud-run-service=$ServiceName
}
if (-not (Test-Gcloud compute backend-services describe $CloudRunBackendName --global --project=$ProjectId)) {
  Invoke-Gcloud compute backend-services create $CloudRunBackendName --project=$ProjectId --global --load-balancing-scheme=EXTERNAL_MANAGED --protocol=HTTP
  Invoke-Gcloud compute backend-services add-backend $CloudRunBackendName --project=$ProjectId --global --network-endpoint-group=$ServerlessNegName --network-endpoint-group-region=$Region
}

Write-Host "Switching the existing HTTPS load balancer to Cloud Run..."
Invoke-Gcloud compute url-maps set-default-service $UrlMapName --project=$ProjectId --global --default-service=$CloudRunBackendName

$HealthUrl = "https://$Domain/api/health"
$EmployeesUrl = "https://$Domain/api/employees"
$Healthy = $false
for ($Attempt = 1; $Attempt -le 30; $Attempt++) {
  try {
    $Health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 15
    if ($Health.status -eq "ok") { $Healthy = $true; break }
  } catch {
    Write-Host "Waiting for load-balancer propagation ($Attempt/30)..."
  }
  Start-Sleep -Seconds 10
}
if (-not $Healthy) {
  throw "Cloud Run did not become healthy through $HealthUrl. Restore the previous backend with the URL map command documented in deploy/gcp/README.md."
}
$Employees = Invoke-RestMethod -Uri $EmployeesUrl -TimeoutSec 20
if ($Employees.stats.total -lt 25) { throw "Cloud Run is healthy, but the expected employee data was not returned." }

Write-Host "Cloud Run cutover succeeded with $($Employees.stats.total) employee records."
Write-Host "Run deploy/gcp/retire-vm.ps1 only after you are satisfied with the Cloud Run deployment."

[CmdletBinding(SupportsShouldProcess, ConfirmImpact = "High")]
param(
  [Parameter(Mandatory)] [string] $ProjectId,
  [Parameter(Mandatory)] [string] $Domain,
  [string] $Zone = "us-central1-a",
  [string] $VmName = "employee-app",
  [string] $VmInstanceGroup = "employee-app-backends",
  [string] $VmBackend = "employee-app-backend",
  [string] $VmHealthCheck = "employee-app-health",
  [string] $VmFirewallRule = "employee-app-allow-load-balancer",
  [string] $VmServiceAccountName = "employee-app-vm",
  [string] $VmSecretName = "employee-app-database-url",
  [string] $CloudRunBackend = "employee-app-cloud-run-backend",
  [string] $UrlMapName = "employee-app-map"
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

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw "Google Cloud CLI (gcloud) is required. See deploy/gcp/README.md."
}

$DefaultService = (& gcloud compute url-maps describe $UrlMapName --project=$ProjectId --global --format="value(defaultService)")
if ($LASTEXITCODE -ne 0 -or $DefaultService -notmatch "/backendServices/$([regex]::Escape($CloudRunBackend))$") {
  throw "The load balancer does not currently target $CloudRunBackend. VM retirement is blocked."
}
$Health = Invoke-RestMethod -Uri "https://$Domain/api/health" -TimeoutSec 20
if ($Health.status -ne "ok") { throw "The public Cloud Run health check failed. VM retirement is blocked." }
$Employees = Invoke-RestMethod -Uri "https://$Domain/api/employees" -TimeoutSec 20
if ($Employees.stats.total -lt 25) { throw "The expected employee data was not returned. VM retirement is blocked." }

if (-not $PSCmdlet.ShouldProcess(
  "VM $VmName and its dedicated backend, health check, instance group, firewall rule, secret, and service account",
  "Permanently retire the validated Compute Engine deployment"
)) { return }

if (Test-Gcloud compute backend-services describe $VmBackend --global --project=$ProjectId) {
  Invoke-Gcloud compute backend-services delete $VmBackend --global --project=$ProjectId --quiet
}
if (Test-Gcloud compute health-checks describe $VmHealthCheck --global --project=$ProjectId) {
  Invoke-Gcloud compute health-checks delete $VmHealthCheck --global --project=$ProjectId --quiet
}
if (Test-Gcloud compute instance-groups unmanaged describe $VmInstanceGroup --zone=$Zone --project=$ProjectId) {
  Invoke-Gcloud compute instance-groups unmanaged delete $VmInstanceGroup --zone=$Zone --project=$ProjectId --quiet
}
if (Test-Gcloud compute instances describe $VmName --zone=$Zone --project=$ProjectId) {
  Invoke-Gcloud compute instances delete $VmName --zone=$Zone --project=$ProjectId --quiet
}
if (Test-Gcloud compute firewall-rules describe $VmFirewallRule --project=$ProjectId) {
  Invoke-Gcloud compute firewall-rules delete $VmFirewallRule --project=$ProjectId --quiet
}
if (Test-Gcloud secrets describe $VmSecretName --project=$ProjectId) {
  Invoke-Gcloud secrets delete $VmSecretName --project=$ProjectId --quiet
}
$VmServiceAccount = "$VmServiceAccountName@$ProjectId.iam.gserviceaccount.com"
if (Test-Gcloud iam service-accounts describe $VmServiceAccount --project=$ProjectId) {
  Invoke-Gcloud iam service-accounts delete $VmServiceAccount --project=$ProjectId --quiet
}

Write-Host "The obsolete Compute Engine deployment has been retired."

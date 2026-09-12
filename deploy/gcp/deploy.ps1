[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $ProjectId,
  [string] $Zone = "us-central1-a",
  [string] $VmName = "employee-app",
  [string] $Repository = "employee-app",
  [string] $BuildServiceAccountName = "employee-app-build",
  [string] $Tag = (git rev-parse --short HEAD),
  [switch] $SkipBuild
)

$ErrorActionPreference = "Stop"
$Region = $Zone -replace "-[a-z]$", ""
$AppImage = "$Region-docker.pkg.dev/$ProjectId/$Repository/employee-app:$Tag"
$MigrationImage = "$Region-docker.pkg.dev/$ProjectId/$Repository/employee-app-migrate:$Tag"
$BuildServiceAccount = "projects/$ProjectId/serviceAccounts/$BuildServiceAccountName@$ProjectId.iam.gserviceaccount.com"

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw "Google Cloud CLI (gcloud) is required. See deploy/gcp/README.md."
}
if (-not (Test-Path "package.json")) {
  throw "Run this command from the repository root."
}

if (-not $SkipBuild) {
  Write-Host "Building and publishing $Tag through Cloud Build..."
  & gcloud builds submit `
    --project=$ProjectId `
    --service-account=$BuildServiceAccount `
    --config=deploy/gcp/cloudbuild.yaml `
    --substitutions="_REGION=$Region,_REPOSITORY=$Repository,_TAG=$Tag" `
    .
  if ($LASTEXITCODE -ne 0) { throw "Cloud Build failed." }
} else {
  Write-Host "Reusing previously published images tagged $Tag..."
}

Write-Host "Updating VM metadata and restarting the VM..."
& gcloud compute instances add-metadata $VmName `
  --project=$ProjectId `
  --zone=$Zone `
  --metadata="app-image=$AppImage,migration-image=$MigrationImage"
if ($LASTEXITCODE -ne 0) { throw "Unable to update VM metadata." }

& gcloud compute instances reset $VmName --project=$ProjectId --zone=$Zone --quiet
if ($LASTEXITCODE -ne 0) { throw "Unable to restart the VM." }

Write-Host "Release initiated. Follow startup logs with:"
Write-Host "gcloud compute ssh $VmName --project=$ProjectId --zone=$Zone --command='sudo journalctl -u google-startup-scripts.service -f'"

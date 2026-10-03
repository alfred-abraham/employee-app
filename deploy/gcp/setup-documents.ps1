[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $ProjectId,
  [Parameter(Mandatory)] [string] $BucketName,
  [string] $Region = "us-central1",
  [string] $RuntimeServiceAccountName = "employee-app-run"
)

$ErrorActionPreference = "Stop"
function Invoke-Gcloud {
  param([Parameter(ValueFromRemainingArguments)] [string[]] $Arguments)
  & gcloud @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Document storage setup failed. Review the gcloud output." }
}

Invoke-Gcloud services enable storage.googleapis.com cloudscheduler.googleapis.com --project=$ProjectId
$BucketInfoJson = & gcloud storage buckets describe "gs://$BucketName" --project=$ProjectId --raw --format=json 2>$null
if ($LASTEXITCODE -ne 0) {
  Invoke-Gcloud storage buckets create "gs://$BucketName" --project=$ProjectId --location=$Region --uniform-bucket-level-access --public-access-prevention --soft-delete-duration=0
  $BucketInfoJson = & gcloud storage buckets describe "gs://$BucketName" --project=$ProjectId --raw --format=json
  if ($LASTEXITCODE -ne 0) { throw "Unable to verify the document bucket." }
}
$BucketInfo = $BucketInfoJson | ConvertFrom-Json
$ProjectNumber = & gcloud projects describe $ProjectId --format="value(projectNumber)"
if ($LASTEXITCODE -ne 0) { throw "Unable to verify bucket ownership." }
if ([string] $BucketInfo.projectNumber -ne [string] $ProjectNumber) { throw "The document bucket must belong to the selected project." }
if ($BucketInfo.iamConfiguration.publicAccessPrevention -ne "enforced" -or -not $BucketInfo.iamConfiguration.uniformBucketLevelAccess.enabled) { throw "The document bucket must enforce public access prevention and uniform bucket-level access." }
if ($BucketInfo.versioning.enabled -or $BucketInfo.retentionPolicy -or [int64] $BucketInfo.softDeletePolicy.retentionDurationSeconds -gt 0 -or $BucketInfo.lifecycle.rule.Count -gt 0) { throw "Use a dedicated document bucket without versioning, retention locks, soft delete, or lifecycle deletion rules. Existing bucket retention settings are not changed automatically." }

$RoleName = "employeeAppDocumentObjects"
& gcloud iam roles describe $RoleName --project=$ProjectId *> $null
if ($LASTEXITCODE -ne 0) {
  Invoke-Gcloud iam roles create $RoleName --project=$ProjectId --title="Employee profile document objects" --permissions="storage.objects.create,storage.objects.get,storage.objects.delete" --stage=GA
}
$RoleInfoJson = & gcloud iam roles describe $RoleName --project=$ProjectId --format=json
if ($LASTEXITCODE -ne 0) { throw "Unable to verify the document object role." }
$RoleInfo = $RoleInfoJson | ConvertFrom-Json
$ExpectedPermissions = @("storage.objects.create", "storage.objects.delete", "storage.objects.get")
if ($RoleInfo.deleted -or $RoleInfo.stage -eq "DISABLED" -or (Compare-Object $ExpectedPermissions @($RoleInfo.includedPermissions | Sort-Object))) { throw "The existing document role must have exactly storage.objects.create/get/delete permissions and be active. It is not expanded automatically." }
# A newly created custom role can take time to become visible to Cloud Storage.
for ($Attempt = 1; $Attempt -le 4; $Attempt++) {
  & gcloud storage buckets add-iam-policy-binding "gs://$BucketName" --member="serviceAccount:$RuntimeServiceAccountName@$ProjectId.iam.gserviceaccount.com" --role="projects/$ProjectId/roles/$RoleName" --quiet
  if ($LASTEXITCODE -eq 0) { break }
  if ($Attempt -eq 4) { throw "Unable to attach the document object role after four attempts." }
  Start-Sleep -Seconds (5 * $Attempt)
}

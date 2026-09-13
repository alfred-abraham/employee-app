[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $ProjectId,
  [Parameter(Mandatory)] [string] $Domain,
  [string] $Region = "us-central1",
  [string] $Zone = "us-central1-a",
  [string] $VmName = "employee-app",
  [string] $SqlInstance = "employee-app-postgres",
  [string] $DatabaseName = "employee_app",
  [string] $DatabaseUser = "employee_app",
  [string] $Repository = "employee-app",
  [string] $ServiceAccountName = "employee-app-vm",
  [string] $BuildServiceAccountName = "employee-app-build",
  [string] $MachineType = "e2-small",
  [string] $SecretName = "employee-app-database-url",
  [SecureString] $DatabasePassword
)

$ErrorActionPreference = "Stop"

function Invoke-Gcloud {
  param([Parameter(ValueFromRemainingArguments)] [string[]] $Arguments)
  & gcloud @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "A gcloud command failed. Review the command output above."
  }
}

function Test-Gcloud {
  param([Parameter(ValueFromRemainingArguments)] [string[]] $Arguments)
  & gcloud @Arguments *> $null
  return $LASTEXITCODE -eq 0
}

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw "Google Cloud CLI (gcloud) is required. See deploy/gcp/README.md."
}
if (-not (Test-Path "deploy/gcp/startup.sh")) {
  throw "Run this command from the repository root."
}
if ($Zone -notlike "$Region-*") {
  throw "Zone '$Zone' must belong to region '$Region'."
}
if (-not $DatabasePassword) {
  $DatabasePassword = Read-Host "Password for Cloud SQL user $DatabaseUser" -AsSecureString
}
$PasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($DatabasePassword)
try {
  $PlainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($PasswordPointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($PasswordPointer)
}
if ([string]::IsNullOrWhiteSpace($PlainPassword)) { throw "Database password cannot be empty." }

$ServiceAccount = "$ServiceAccountName@$ProjectId.iam.gserviceaccount.com"
$BuildServiceAccount = "$BuildServiceAccountName@$ProjectId.iam.gserviceaccount.com"
$BuildServiceAccountResource = "projects/$ProjectId/serviceAccounts/$BuildServiceAccount"
$CloudBuildSourceBucket = "${ProjectId}_cloudbuild"
$ImageTag = (git rev-parse --short HEAD)
$AppImage = "$Region-docker.pkg.dev/$ProjectId/$Repository/employee-app:$ImageTag"
$MigrationImage = "$Region-docker.pkg.dev/$ProjectId/$Repository/employee-app-migrate:$ImageTag"

Invoke-Gcloud config set project $ProjectId
Invoke-Gcloud services enable `
  artifactregistry.googleapis.com `
  cloudbuild.googleapis.com `
  compute.googleapis.com `
  iam.googleapis.com `
  secretmanager.googleapis.com `
  sqladmin.googleapis.com `
  storage.googleapis.com

if (-not (Test-Gcloud artifacts repositories describe $Repository --location=$Region --project=$ProjectId)) {
  Invoke-Gcloud artifacts repositories create $Repository --repository-format=docker --location=$Region --project=$ProjectId
}

if (-not (Test-Gcloud iam service-accounts describe $ServiceAccount --project=$ProjectId)) {
  Invoke-Gcloud iam service-accounts create $ServiceAccountName --display-name="Employee app VM" --project=$ProjectId
}
if (-not (Test-Gcloud iam service-accounts describe $BuildServiceAccount --project=$ProjectId)) {
  Invoke-Gcloud iam service-accounts create $BuildServiceAccountName --display-name="Employee app Cloud Build" --project=$ProjectId
}
foreach ($Role in @(
  "roles/cloudsql.client",
  "roles/logging.logWriter",
  "roles/monitoring.metricWriter"
)) {
  Invoke-Gcloud projects add-iam-policy-binding $ProjectId --member="serviceAccount:$ServiceAccount" --role=$Role --quiet
}
Invoke-Gcloud artifacts repositories add-iam-policy-binding $Repository `
  --location=$Region `
  --project=$ProjectId `
  --member="serviceAccount:$ServiceAccount" `
  --role=roles/artifactregistry.reader
Invoke-Gcloud artifacts repositories add-iam-policy-binding $Repository `
  --location=$Region `
  --project=$ProjectId `
  --member="serviceAccount:$BuildServiceAccount" `
  --role=roles/artifactregistry.writer
Invoke-Gcloud projects add-iam-policy-binding $ProjectId `
  --member="serviceAccount:$BuildServiceAccount" `
  --role=roles/logging.logWriter `
  --quiet
if (-not (Test-Gcloud storage buckets describe "gs://$CloudBuildSourceBucket" --project=$ProjectId)) {
  Invoke-Gcloud storage buckets create "gs://$CloudBuildSourceBucket" `
    --project=$ProjectId `
    --location=$Region `
    --uniform-bucket-level-access
}
Invoke-Gcloud storage buckets add-iam-policy-binding "gs://$CloudBuildSourceBucket" `
  --member="serviceAccount:$BuildServiceAccount" `
  --role=roles/storage.objectViewer

if (-not (Test-Gcloud sql instances describe $SqlInstance --project=$ProjectId)) {
  Invoke-Gcloud sql instances create $SqlInstance `
    --project=$ProjectId `
    --region=$Region `
    --database-version=POSTGRES_17 `
    --edition=enterprise `
    --cpu=1 `
    --memory=3840MiB `
    --storage-type=SSD `
    --storage-size=10 `
    --storage-auto-increase `
    --availability-type=zonal `
    --backup-start-time=04:00 `
    --enable-point-in-time-recovery `
    --retained-backups-count=7
}

if (-not (Test-Gcloud sql databases describe $DatabaseName --instance=$SqlInstance --project=$ProjectId)) {
  Invoke-Gcloud sql databases create $DatabaseName --instance=$SqlInstance --project=$ProjectId
}
if (Test-Gcloud sql users describe $DatabaseUser --instance=$SqlInstance --project=$ProjectId) {
  Invoke-Gcloud sql users set-password $DatabaseUser --instance=$SqlInstance --password=$PlainPassword --project=$ProjectId
} else {
  Invoke-Gcloud sql users create $DatabaseUser --instance=$SqlInstance --password=$PlainPassword --project=$ProjectId
}

$ConnectionName = (& gcloud sql instances describe $SqlInstance --project=$ProjectId --format="value(connectionName)")
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($ConnectionName)) {
  throw "Unable to read the Cloud SQL connection name."
}
$EncodedPassword = [Uri]::EscapeDataString($PlainPassword)
$DatabaseUrl = "postgresql://${DatabaseUser}:${EncodedPassword}@127.0.0.1:5432/${DatabaseName}"
$SecretFile = New-TemporaryFile
try {
  [IO.File]::WriteAllText($SecretFile.FullName, $DatabaseUrl, [Text.UTF8Encoding]::new($false))
  if (-not (Test-Gcloud secrets describe $SecretName --project=$ProjectId)) {
    Invoke-Gcloud secrets create $SecretName --replication-policy=automatic --project=$ProjectId
  }
  Invoke-Gcloud secrets versions add $SecretName --data-file=$($SecretFile.FullName) --project=$ProjectId
  Invoke-Gcloud secrets add-iam-policy-binding $SecretName `
    --project=$ProjectId `
    --member="serviceAccount:$ServiceAccount" `
    --role=roles/secretmanager.secretAccessor
} finally {
  Remove-Item -LiteralPath $SecretFile.FullName -Force
  $PlainPassword = $null
  $DatabaseUrl = $null
}

Invoke-Gcloud builds submit `
  --project=$ProjectId `
  --service-account=$BuildServiceAccountResource `
  --config=deploy/gcp/cloudbuild.yaml `
  --substitutions="_REGION=$Region,_REPOSITORY=$Repository,_TAG=$ImageTag" `
  .

if (-not (Test-Gcloud compute instances describe $VmName --zone=$Zone --project=$ProjectId)) {
  Invoke-Gcloud compute instances create $VmName `
    --project=$ProjectId `
    --zone=$Zone `
    --machine-type=$MachineType `
    --image-family=cos-stable `
    --image-project=cos-cloud `
    --service-account=$ServiceAccount `
    --scopes=cloud-platform `
    --tags=employee-app-backend `
    --metadata="app-image=$AppImage,migration-image=$MigrationImage,artifact-region=$Region,cloud-sql-instance=$ConnectionName,database-url-secret=$SecretName" `
    --metadata-from-file=startup-script=deploy/gcp/startup.sh
} else {
  Invoke-Gcloud compute instances add-metadata $VmName `
    --project=$ProjectId `
    --zone=$Zone `
    --metadata="app-image=$AppImage,migration-image=$MigrationImage,artifact-region=$Region,cloud-sql-instance=$ConnectionName,database-url-secret=$SecretName" `
    --metadata-from-file=startup-script=deploy/gcp/startup.sh
  Invoke-Gcloud compute instances reset $VmName --project=$ProjectId --zone=$Zone --quiet
}

if (-not (Test-Gcloud compute firewall-rules describe employee-app-allow-load-balancer --project=$ProjectId)) {
  Invoke-Gcloud compute firewall-rules create employee-app-allow-load-balancer `
    --project=$ProjectId `
    --network=default `
    --allow=tcp:3000 `
    --source-ranges="35.191.0.0/16,130.211.0.0/22" `
    --target-tags=employee-app-backend
}

if (-not (Test-Gcloud compute instance-groups unmanaged describe employee-app-backends --zone=$Zone --project=$ProjectId)) {
  Invoke-Gcloud compute instance-groups unmanaged create employee-app-backends --zone=$Zone --project=$ProjectId
  Invoke-Gcloud compute instance-groups unmanaged add-instances employee-app-backends --instances=$VmName --zone=$Zone --project=$ProjectId
  Invoke-Gcloud compute instance-groups unmanaged set-named-ports employee-app-backends --named-ports=http:3000 --zone=$Zone --project=$ProjectId
}
if (-not (Test-Gcloud compute health-checks describe employee-app-health --global --project=$ProjectId)) {
  Invoke-Gcloud compute health-checks create http employee-app-health --global --port=3000 --request-path=/api/health --project=$ProjectId
}
if (-not (Test-Gcloud compute backend-services describe employee-app-backend --global --project=$ProjectId)) {
  Invoke-Gcloud compute backend-services create employee-app-backend --global --load-balancing-scheme=EXTERNAL_MANAGED --protocol=HTTP --health-checks=employee-app-health --port-name=http --project=$ProjectId
  Invoke-Gcloud compute backend-services add-backend employee-app-backend --global --instance-group=employee-app-backends --instance-group-zone=$Zone --project=$ProjectId
}
if (-not (Test-Gcloud compute url-maps describe employee-app-map --global --project=$ProjectId)) {
  Invoke-Gcloud compute url-maps create employee-app-map --default-service=employee-app-backend --global --project=$ProjectId
}
if (-not (Test-Gcloud compute ssl-certificates describe employee-app-certificate --global --project=$ProjectId)) {
  Invoke-Gcloud compute ssl-certificates create employee-app-certificate --domains=$Domain --global --project=$ProjectId
}
if (-not (Test-Gcloud compute target-https-proxies describe employee-app-https-proxy --global --project=$ProjectId)) {
  Invoke-Gcloud compute target-https-proxies create employee-app-https-proxy --url-map=employee-app-map --ssl-certificates=employee-app-certificate --global --project=$ProjectId
}
if (-not (Test-Gcloud compute addresses describe employee-app-ip --global --project=$ProjectId)) {
  Invoke-Gcloud compute addresses create employee-app-ip --ip-version=IPV4 --network-tier=PREMIUM --global --project=$ProjectId
}
if (-not (Test-Gcloud compute forwarding-rules describe employee-app-https --global --project=$ProjectId)) {
  Invoke-Gcloud compute forwarding-rules create employee-app-https --address=employee-app-ip --global --load-balancing-scheme=EXTERNAL_MANAGED --network-tier=PREMIUM --target-https-proxy=employee-app-https-proxy --ports=443 --project=$ProjectId
}

$LoadBalancerIp = (& gcloud compute addresses describe employee-app-ip --global --project=$ProjectId --format="value(address)")
Write-Host "Infrastructure is ready. Point an A record for $Domain to $LoadBalancerIp."
Write-Host "The Google-managed certificate becomes active after DNS propagation."

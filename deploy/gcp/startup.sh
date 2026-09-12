#!/bin/bash
set -Eeuo pipefail

readonly METADATA_URL="http://metadata.google.internal/computeMetadata/v1"
readonly PROXY_CONTAINER="employee-cloud-sql-proxy"
readonly APP_CONTAINER="employee-app"
readonly ENV_FILE="/run/employee-app.env"
readonly PROXY_IMAGE="gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.25.4"

metadata() {
  curl --fail --silent --show-error \
    --header "Metadata-Flavor: Google" \
    "${METADATA_URL}/$1"
}

attribute() {
  metadata "instance/attributes/$1"
}

wait_for_url() {
  local url="$1"
  local attempts="${2:-60}"
  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if curl --fail --silent --show-error "$url" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

PROJECT_ID="$(metadata project/project-id)"
APP_IMAGE="$(attribute app-image)"
MIGRATION_IMAGE="$(attribute migration-image)"
ARTIFACT_REGION="$(attribute artifact-region)"
INSTANCE_CONNECTION_NAME="$(attribute cloud-sql-instance)"
DATABASE_URL_SECRET="$(attribute database-url-secret)"

# Container-Optimized OS includes Docker and docker-credential-gcr. The VM's
# service account is granted read-only Artifact Registry access.
docker-credential-gcr configure-docker \
  --registries="${ARTIFACT_REGION}-docker.pkg.dev"
docker pull "$APP_IMAGE"
docker pull "$MIGRATION_IMAGE"
docker pull "$PROXY_IMAGE"

# Obtain the database URL at boot without storing it in instance metadata.
ACCESS_TOKEN_JSON="$(metadata instance/service-accounts/default/token)"
ACCESS_TOKEN="$(printf '%s' "$ACCESS_TOKEN_JSON" | sed -n 's/.*"access_token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
SECRET_JSON="$(curl --fail --silent --show-error \
  --header "Authorization: Bearer ${ACCESS_TOKEN}" \
  "https://secretmanager.googleapis.com/v1/projects/${PROJECT_ID}/secrets/${DATABASE_URL_SECRET}/versions/latest:access")"
DATABASE_URL_B64="$(printf '%s' "$SECRET_JSON" | sed -n 's/.*"data"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"

if [[ -z "$ACCESS_TOKEN" || -z "$DATABASE_URL_B64" ]]; then
  echo "Unable to obtain the database secret" >&2
  exit 1
fi

umask 077
printf 'DATABASE_URL=%s\n' "$(printf '%s' "$DATABASE_URL_B64" | base64 --decode)" >"$ENV_FILE"

docker rm --force "$PROXY_CONTAINER" >/dev/null 2>&1 || true
docker run --detach \
  --name "$PROXY_CONTAINER" \
  --restart unless-stopped \
  --network host \
  "$PROXY_IMAGE" \
  --address 127.0.0.1 \
  --port 5432 \
  "$INSTANCE_CONNECTION_NAME"

for attempt in {1..30}; do
  if (echo >/dev/tcp/127.0.0.1/5432) >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" == "30" ]]; then
    docker logs "$PROXY_CONTAINER" >&2
    exit 1
  fi
  sleep 2
done

# A failed migration stops the rollout and leaves the previous app container
# untouched. Migration files are tracked by app_migrations and are idempotent.
docker run --rm \
  --network host \
  --env-file "$ENV_FILE" \
  "$MIGRATION_IMAGE" npm run db:migrate

docker rm --force "${APP_CONTAINER}-previous" >/dev/null 2>&1 || true
if docker inspect "$APP_CONTAINER" >/dev/null 2>&1; then
  docker rename "$APP_CONTAINER" "${APP_CONTAINER}-previous"
  docker stop "${APP_CONTAINER}-previous" >/dev/null
fi

if ! docker run --detach \
  --name "$APP_CONTAINER" \
  --restart unless-stopped \
  --network host \
  --env-file "$ENV_FILE" \
  "$APP_IMAGE"; then
  if docker inspect "${APP_CONTAINER}-previous" >/dev/null 2>&1; then
    docker rename "${APP_CONTAINER}-previous" "$APP_CONTAINER"
    docker start "$APP_CONTAINER" >/dev/null
  fi
  exit 1
fi

if ! wait_for_url "http://127.0.0.1:3000/api/health" 60; then
  docker logs "$APP_CONTAINER" >&2
  docker rm --force "$APP_CONTAINER" >/dev/null 2>&1 || true
  if docker inspect "${APP_CONTAINER}-previous" >/dev/null 2>&1; then
    docker rename "${APP_CONTAINER}-previous" "$APP_CONTAINER"
    docker start "$APP_CONTAINER" >/dev/null
  fi
  exit 1
fi

docker rm --force "${APP_CONTAINER}-previous" >/dev/null 2>&1 || true
echo "Employee app rollout completed successfully"

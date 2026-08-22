#!/usr/bin/env bash
set -euo pipefail

HEALTH_URL="${ETSY_HEALTH_URL:-}"
HEALTH_TOKEN="${ETSY_HEALTH_TOKEN:-}"
TIMEOUT_SECONDS="${ETSY_HEALTH_TIMEOUT_SECONDS:-15}"

if [[ -z "$HEALTH_URL" ]]; then
  echo 'ETSY_HEALTH_URL is required, for example https://app.example.com/api/integrations/etsy/health' >&2
  exit 2
fi

if [[ ! "$TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || [[ "$TIMEOUT_SECONDS" -lt 1 ]]; then
  echo 'ETSY_HEALTH_TIMEOUT_SECONDS must be a positive integer' >&2
  exit 2
fi

headers=(-H 'accept: application/json')
if [[ -n "$HEALTH_TOKEN" ]]; then
  headers+=(-H "authorization: Bearer $HEALTH_TOKEN")
fi

body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT

http_status="$(curl --silent --show-error --max-time "$TIMEOUT_SECONDS" \
  --output "$body_file" --write-out '%{http_code}' \
  "${headers[@]}" "$HEALTH_URL" || true)"

cat "$body_file"
printf '\n'

if [[ "$http_status" != '200' ]]; then
  echo "Etsy health endpoint returned HTTP $http_status" >&2
  exit 1
fi

if ! grep -q '"status":"healthy"' "$body_file"; then
  echo 'Etsy health endpoint is not healthy' >&2
  exit 1
fi

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
METRICS_TOKEN="${METRICS_BEARER_TOKEN:-}"

echo "Checking liveness at ${BASE_URL}/health/live"
curl --fail --silent "${BASE_URL}/health/live" | grep -q '"status":"live"'

echo "Checking readiness at ${BASE_URL}/health/ready"
curl --fail --silent "${BASE_URL}/health/ready" | grep -q '"status":"ready"'

echo "Checking legacy health at ${BASE_URL}/health"
curl --fail --silent "${BASE_URL}/health" | grep -q '"status":"ok"'

if [[ -n "${METRICS_TOKEN}" ]]; then
  echo "Checking protected metrics endpoint"
  curl --fail --silent \
    -H "Authorization: Bearer ${METRICS_TOKEN}" \
    "${BASE_URL}/metrics" | grep -q "shipcheck_http_requests_total"
else
  echo "Skipping /metrics check because METRICS_BEARER_TOKEN is unset"
fi

echo "Deployment smoke checks passed."

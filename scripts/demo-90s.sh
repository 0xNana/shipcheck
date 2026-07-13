#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3100}"
BASE_URL="http://127.0.0.1:${PORT}"

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then
    kill "${API_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${FIXTURE_PID:-}" ]]; then
    kill "${FIXTURE_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "Starting fixture sites"
node "${ROOT}/apps/fixture-sites/dist/cli.js" >/tmp/shipcheck-fixtures.log 2>&1 &
FIXTURE_PID=$!
sleep 2
FIXTURE_ORIGIN="$(rg -o 'https?://127.0.0.1:[0-9]+' /tmp/shipcheck-fixtures.log | tail -1)"
DELIVERY_URL="${FIXTURE_ORIGIN}/demo"

echo "Starting API on port ${PORT}"
PORT="${PORT}" \
PUBLIC_BASE_URL="${BASE_URL}" \
VERIFICATION_ENABLED=true \
BROWSER_EXECUTION_ENABLED=true \
ALLOW_FREE_TEST_ROUTE=true \
DATABASE_URL="${DATABASE_URL:-postgresql://shipcheck:shipcheck@127.0.0.1:5432/shipcheck}" \
OBJECT_STORE_ENDPOINT="${OBJECT_STORE_ENDPOINT:-http://127.0.0.1:9000}" \
OBJECT_STORE_BUCKET="${OBJECT_STORE_BUCKET:-shipcheck-evidence}" \
OBJECT_STORE_ACCESS_KEY="${OBJECT_STORE_ACCESS_KEY:-test}" \
OBJECT_STORE_SECRET_KEY="${OBJECT_STORE_SECRET_KEY:-test}" \
OPENAI_API_KEY="${OPENAI_API_KEY:-test-key}" \
REQUIREMENT_COMPILER_MODEL="${REQUIREMENT_COMPILER_MODEL:-gpt-4.1-mini}" \
OKX_API_KEY="${OKX_API_KEY:-demo-key}" \
OKX_SECRET_KEY="${OKX_SECRET_KEY:-demo-secret}" \
OKX_PASSPHRASE="${OKX_PASSPHRASE:-demo-pass}" \
PAY_TO_ADDRESS="${PAY_TO_ADDRESS:-0x1111111111111111111111111111111111111111}" \
X402_NETWORK="${X402_NETWORK:-eip155:1952}" \
SHIPCHECK_PRICE="${SHIPCHECK_PRICE:-$0.01}" \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-/usr/bin/google-chrome}" \
node "${ROOT}/apps/api/dist/server.js" >/tmp/shipcheck-api.log 2>&1 &
API_PID=$!
sleep 5

echo "Compiling acceptance contract against ${DELIVERY_URL}"
COMPILE_RESPONSE="$(curl --fail --silent \
  -H 'Content-Type: application/json' \
  -d "{\"brief\":\"Build a launch page with pricing.\",\"deliveryUrl\":\"${DELIVERY_URL}\",\"mode\":\"quick\",\"maxRequirements\":8}" \
  "${BASE_URL}/v1/compile")"
echo "${COMPILE_RESPONSE}" | grep -q '"contractId"'

echo "Demo runbook completed in under 90 seconds."

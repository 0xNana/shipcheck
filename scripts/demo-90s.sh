#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3100}"
BASE_URL="http://127.0.0.1:${PORT}"
# Bash treats `$0` as the script name inside "${VAR:-$0.01}" — set explicitly.
SHIPCHECK_PRICE='$0.01'
REQUIREMENT_COMPILER_MODEL='gpt-5.6-terra'

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
node "${ROOT}/apps/fixture-sites/dist/cli.js" --https >/tmp/shipcheck-fixtures.log 2>&1 &
FIXTURE_PID=$!
sleep 2
FIXTURE_ORIGIN="$(rg -o 'https?://127.0.0.1:[0-9]+' /tmp/shipcheck-fixtures.log | tail -1)"
DELIVERY_URL="${FIXTURE_ORIGIN}/demo"

echo "Starting API on port ${PORT}"
if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "ERROR: export OPENAI_API_KEY before running the demo compile step." >&2
  exit 1
fi
PORT="${PORT}" \
PUBLIC_BASE_URL="${BASE_URL}" \
VERIFICATION_ENABLED=true \
BROWSER_EXECUTION_ENABLED=true \
ALLOW_FREE_TEST_ROUTE=true \
OKX_SYNC_FACILITATOR_ON_START=false \
DATABASE_URL="${DATABASE_URL:-postgresql://shipcheck:shipcheck@127.0.0.1:5432/shipcheck}" \
TIGRIS_STORAGE_ENDPOINT="${TIGRIS_STORAGE_ENDPOINT:-http://127.0.0.1:9000}" \
TIGRIS_STORAGE_BUCKET="${TIGRIS_STORAGE_BUCKET:-shipcheck}" \
TIGRIS_STORAGE_ACCESS_KEY_ID="${TIGRIS_STORAGE_ACCESS_KEY_ID:-test}" \
TIGRIS_STORAGE_SECRET_ACCESS_KEY="${TIGRIS_STORAGE_SECRET_ACCESS_KEY:-test}" \
OPENAI_API_KEY="${OPENAI_API_KEY:-test-key}" \
REQUIREMENT_COMPILER_MODEL="${REQUIREMENT_COMPILER_MODEL}" \
OKX_API_KEY="${OKX_API_KEY:-demo-key}" \
OKX_SECRET_KEY="${OKX_SECRET_KEY:-demo-secret}" \
OKX_PASSPHRASE="${OKX_PASSPHRASE:-demo-pass}" \
PAY_TO_ADDRESS="${PAY_TO_ADDRESS:-0x1111111111111111111111111111111111111111}" \
X402_NETWORK="${X402_NETWORK:-eip155:1952}" \
SHIPCHECK_PRICE="${SHIPCHECK_PRICE}" \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-/usr/bin/google-chrome}" \
node "${ROOT}/apps/api/dist/server.js" >/tmp/shipcheck-api.log 2>&1 &
API_PID=$!
sleep 5

echo "Compiling acceptance contract against ${DELIVERY_URL}"
COMPILE_RESPONSE="$(
  curl --silent --show-error \
    -w '\n__HTTP_STATUS__:%{http_code}' \
    -H 'Content-Type: application/json' \
    -d "{\"brief\":\"Build a launch page with pricing.\",\"deliveryUrl\":\"${DELIVERY_URL}\",\"mode\":\"quick\",\"maxRequirements\":8}" \
    "${BASE_URL}/v1/compile"
)"
COMPILE_STATUS="${COMPILE_RESPONSE##*__HTTP_STATUS__:}"
COMPILE_BODY="${COMPILE_RESPONSE%$'\n'__HTTP_STATUS__:*}"
if [[ "${COMPILE_STATUS}" != "200" ]]; then
  echo "Compile failed (HTTP ${COMPILE_STATUS}):" >&2
  echo "${COMPILE_BODY}" >&2
  echo "--- last lines of /tmp/shipcheck-api.log ---" >&2
  tail -10 /tmp/shipcheck-api.log >&2 || true
  exit 1
fi
echo "${COMPILE_BODY}" | grep -q '"contractId"'

echo "Demo runbook completed in under 90 seconds."

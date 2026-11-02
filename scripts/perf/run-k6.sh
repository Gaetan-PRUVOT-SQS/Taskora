#!/usr/bin/env bash
# Starts the backend on the database given by DATABASE_URL (or TEST_DATABASE_URL),
# runs the k6 scenario, writes test-results/k6-summary.json and stops the server.
# Usage: scripts/perf/run-k6.sh [smoke|load]
set -euo pipefail

profile="${1:-smoke}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
port="${PERF_PORT:-3901}"
out="$root/test-results"
mkdir -p "$out"

db_url="${DATABASE_URL:-${TEST_DATABASE_URL:-}}"
if [ -z "$db_url" ]; then
  echo "run-k6: DATABASE_URL or TEST_DATABASE_URL is required (real PostgreSQL)" >&2
  exit 2
fi
if ! command -v k6 >/dev/null 2>&1; then
  echo "run-k6: k6 is not installed (https://grafana.com/docs/k6/latest/set-up/install-k6/)" >&2
  exit 2
fi

# Throwaway secret for this run only. The rate limits are raised because every
# virtual user comes from the same address; the limiter has its own tests.
secret="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(48).toString("base64url"))')"
log="$out/k6-server.log"
(
  cd "$root/backend"
  DATABASE_URL="$db_url" JWT_SECRET="$secret" PORT="$port" \
    RATE_LIMIT_MAX=100000 AUTH_RATE_LIMIT_MAX=1000 \
    exec node src/index.js >"$log" 2>&1
) &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT

if curl -fs "http://127.0.0.1:$port/api/auth/oauth/status" >/dev/null 2>&1; then
  echo "run-k6: port $port already answers, stop that server first" >&2
  exit 2
fi
ready=0
for _ in $(seq 1 50); do
  if curl -fs "http://127.0.0.1:$port/api/auth/oauth/status" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.2
done
if [ "$ready" != 1 ]; then
  echo "run-k6: server did not start, see $log" >&2
  exit 2
fi

# Same for the password of the load test accounts: drawn here, never stored.
password="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(24).toString("base64url"))')"
K6_PROFILE="$profile" BASE_URL="http://127.0.0.1:$port" K6_PASSWORD="$password" \
  k6 run --quiet --summary-export "$out/k6-summary.json" \
  "$root/test/performance/k6/board-load.js"

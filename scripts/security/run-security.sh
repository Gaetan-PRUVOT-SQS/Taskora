#!/usr/bin/env bash
# Security checks of the repository, same rules locally and in CI:
#   1. Semgrep SAST (JavaScript and Node rule packs), fails on any finding;
#      known false positives carry a nosemgrep comment with the reason
#   2. npm audit of the whole workspace, fails on high or critical advisories
#   3. gitleaks on the git history when installed (CI always installs it)
# CodeQL runs only in GitHub Actions (.github/workflows/security.yml).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
mkdir -p test-results
status=0

if command -v semgrep >/dev/null 2>&1; then
  echo "== semgrep"
  semgrep scan --config p/javascript --config p/nodejsscan --metrics=off --error --quiet \
    --json --output test-results/semgrep.json backend/src frontend/src || status=1
  node -e 'const r=require("./test-results/semgrep.json");for(const f of r.results){console.log(f.path+":"+f.start.line+" "+f.check_id)};console.log("semgrep findings: "+r.results.length)'
elif [[ "${CI:-}" == true ]]; then
  echo "semgrep is missing in CI" >&2; status=1
else
  echo "WARN semgrep not installed: SAST skipped (pip install semgrep)" >&2
fi

echo "== npm audit (high and critical)"
npm audit --audit-level=high --omit=optional || status=1

if command -v gitleaks >/dev/null 2>&1; then
  echo "== gitleaks"
  gitleaks git --redact --no-banner --report-path test-results/gitleaks.json . || status=1
elif [[ "${CI:-}" == true ]]; then
  echo "gitleaks is missing in CI" >&2; status=1
else
  echo "WARN gitleaks not installed: secret scan skipped (runs in CI)" >&2
fi

exit "$status"

#!/usr/bin/env bash
# test-pipeline.sh: generic feature test pipeline, fail-closed
#   security -> lint -> unit -> functional -> regression -> coverage on changed code
# Detects stacks on its own: Node (Cypress/Playwright/Jest/Vitest), Android/Gradle, C (CMake/Make), Python.
# Taskora copy of the shared template: same rules, plus the PostgreSQL test database (see "test database").
#
# Usage: scripts/test-pipeline.sh [stage ...]
#        scripts/test-pipeline.sh --check-config     validate settings and print the effective values
#   stages: security lint unit functional regression (default: all, in that order).
#   Running a subset is fine while iterating; only the full run counts for "done".
#
# Every requested stage must run and pass. A stage that finds nothing to run, a missing runner or tool,
# or a measurement that cannot be made is a failure, never a silent green.
#
# Floors. These values are fixed here and in the workflow, settings can only make them stricter:
#   coverage on changed lines >= 80%, flaky reruns >= 2 (max 5), dependency-check fails at CVSS >= 7.0
#   or lower, hadolint fails at warning or stricter, flaky tests are never accepted.
#
# Settings from the environment (trusted: you, or the CI workflow):
#   BASE_REF=origin/main            base for changed-code coverage and the secret scan range
#   RESULTS_DIR=test-results        relative path inside the repo
#   SECURITY_CHECKS="secrets sca sast dockerfile workflows"   subset to run (CI splits them in jobs)
#   SAST_TOOL=semgrep               semgrep, or codeql-ci (only inside GitHub Actions, where the codeql
#                                   job of the workflow does the SAST)
#   PIPELINE_REQUIRED_STAGES        stages that must be part of this run (the CI sets it)
#   NVD_API_KEY                     used by dependency-check (Gradle projects)
#   HOST=127.0.0.1                  address test servers should bind to, 0.0.0.0 and :: are refused
#   TEST_DATABASE_URL               PostgreSQL on 127.0.0.1 or localhost for the API, functional and E2E
#                                   tests. Unset: scripts/test-db.sh starts a throwaway container,
#                                   except in CI (CI=true) where the workflow must provide it.
#   KEEP_TEST_DB=0                  1 = leave the container started by scripts/test-db.sh running
#
# Settings from .test-pipeline.env (the repo, so less trusted). Plain KEY=value lines, read as data and
# never executed, unknown keys are rejected, the environment wins over the file. Changes to this file
# need an approved review (see the pipeline-config-guard workflow and CODEOWNERS).
#   LINT_CMD UNIT_CMD FUNCTIONAL_CMD REGRESSION_CMD  custom command for a stage (replaces detection).
#                                   Run with bash -c. Empty, no-op or failure-masking commands are refused.
#   E2E_RUNNER=cypress|playwright   force the E2E runner (default: cypress if present)
#   CYPRESS_BROWSER=chrome          browser for cypress run (Electron is deprecated in Cypress 16)
#   E2E_SPEC=<glob>                 restrict the functional stage to the feature's specs
#   COVERAGE_MIN=80                 can only be raised
#   FLAKY_RERUNS=2                  can only be raised, up to 5
#   REQUIRE_DEVICE=0                1 = Android instrumented tests are mandatory, no exemption possible
#   HADOLINT_THRESHOLD=warning      warning, info or style
#   DC_FAIL_CVSS=7.0                can only be lowered
#   DC_SUPPRESSION                  dependency-check suppression file, every entry with a <notes> reason
#   SEMGREP_EXTRA_CONFIG            extra Semgrep rules, on top of p/default
#   SECRETS_FULL_HISTORY=0          1 = scan the whole git history instead of BASE_REF..HEAD
#   C_BUILD C_SRC_DIRS CTEST_UNIT_ARGS CTEST_FUNCTIONAL_ARGS MAKE_UNIT_TARGET MAKE_REGRESSION_TARGET
#   GRADLE_LINT_TASKS GRADLE_UNIT_TASKS GRADLE_FUNCTIONAL_TASKS GRADLE_REGRESSION_TASKS
#
# Exemptions. The only way past the coverage gate or the functional gate (no E2E runner, no device,
# no functional test) is a written justification of at least 20 characters. It is printed in the summary.
#   COVERAGE_EXEMPT_REASON="..."    E2E_EXEMPT_REASON="..."
# Security findings are never waived by a variable. Known false positives go in the tools' own files,
# reviewed with the code: .gitleaksignore, osv-scanner.toml, nosemgrep comments, hadolint ignores, DC_SUPPRESSION.
#
# Exit codes: 0 OK | 2 usage or refused setting | 3 no stack | 4 test database | 10 lint | 20 unit | 30 functional
#             | 40 regression | 50 coverage | 60 flaky test | 70 security | 80 incomplete run
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ---------- floors (keep in sync with the workflow, which checks them) ----------
readonly COVERAGE_FLOOR=80
readonly FLAKY_RERUNS_FLOOR=2
readonly FLAKY_RERUNS_MAX=5
readonly DC_CVSS_CEILING=7.0
readonly MIN_REASON_LEN=20
readonly NODE_MAJOR_MIN=22
readonly ALL_STAGES="security lint unit functional regression"
readonly ALL_SECURITY_CHECKS="secrets sca sast dockerfile workflows"

log()  { printf '\033[1;34m[pipeline]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[pipeline] WARN:\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31m[pipeline] ERROR:\033[0m %s\n' "$*" >&2; }
die()  { local code="$1"; shift; err "$*"; exit "$code"; }
has()  { command -v "$1" >/dev/null 2>&1; }
trim() { local v="$1"; v="${v#"${v%%[![:space:]]*}"}"; printf '%s' "${v%"${v##*[![:space:]]}"}"; }
in_list() { [[ -n "$1" && "$1" != *[[:space:]]* && " $2 " == *" $1 "* ]]; }
# sx: run a command whose LAST arg is a space-separated word list (intentional splitting)
sx() { local -a w; read -ra w <<<"${*: -1}"; "${@:1:$#-1}" "${w[@]}"; }

# ---------- settings ----------
FILE_KEYS="LINT_CMD UNIT_CMD FUNCTIONAL_CMD REGRESSION_CMD E2E_RUNNER CYPRESS_BROWSER E2E_SPEC COVERAGE_MIN
FLAKY_RERUNS REQUIRE_DEVICE HADOLINT_THRESHOLD DC_FAIL_CVSS DC_SUPPRESSION SEMGREP_EXTRA_CONFIG
SECRETS_FULL_HISTORY C_BUILD C_SRC_DIRS CTEST_UNIT_ARGS CTEST_FUNCTIONAL_ARGS MAKE_UNIT_TARGET
MAKE_REGRESSION_TARGET GRADLE_LINT_TASKS GRADLE_UNIT_TASKS GRADLE_FUNCTIONAL_TASKS GRADLE_REGRESSION_TASKS
COVERAGE_EXEMPT_REASON E2E_EXEMPT_REASON"
FILE_KEYS="${FILE_KEYS//$'\n'/ }"
FILE_SET=()
load_settings() {
  local f=.test-pipeline.env line key val n=0
  [[ -f "$f" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    n=$((n + 1))
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*(#.*)?$ ]] && continue
    [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Z][A-Z0-9_]*)=(.*)$ ]] \
      || die 2 "$f line $n: expected KEY=value"
    key="${BASH_REMATCH[2]}"; val="${BASH_REMATCH[3]}"
    in_list "$key" "$FILE_KEYS" || die 2 "$f line $n: $key cannot be set from the repo (unknown or environment-only)"
    if [[ "$val" =~ ^\"(.*)\"$ || "$val" =~ ^\'(.*)\'$ ]]; then val="${BASH_REMATCH[1]}"; fi
    if [[ -z "${!key+set}" ]]; then printf -v "$key" '%s' "$val"; export "${key?}"; FILE_SET+=("$key"); fi
  done <"$f"
}

# A command is refused when it is empty, made only of no-op builtins, or masks failures.
# This is a guard against the obvious cases, not a proof: review stays the real control.
trivial_cmd() {
  local c seg w
  c="$(trim "$1")"
  [[ -z "$c" ]] && return 0
  # failure masking: "|| true", "|| :", "|| exit 0", "; exit 0", "set +e", "trap ... EXIT"
  [[ "$c" =~ (\|\||\;|\&)[[:space:]]*(true|:|/bin/true|/usr/bin/true|exit([[:space:]]+0)?|return([[:space:]]+0)?)[[:space:]]*($|\;|\&|\|) ]] && return 0
  [[ "$c" =~ (^|[[:space:];&|])set[[:space:]]+\+e ]] && return 0
  [[ "$c" =~ (^|[[:space:];&|])trap[[:space:]] ]] && return 0
  while IFS= read -r seg; do
    seg="$(trim "$seg")"
    [[ -z "$seg" ]] && continue
    # drop wrappers and variable assignments in front of the command
    while [[ "$seg" =~ ^(exec|command|builtin|nohup|time|env|[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*)([[:space:]]+(.*))?$ ]]; do
      seg="${BASH_REMATCH[3]:-}"
    done
    w="${seg%%[[:space:]]*}"
    w="${w#\(}"; w="${w#\{}"; w="${w%\)}"; w="${w%[;]}"
    case "$w" in
      ''|true|:|false|/bin/true|/usr/bin/true|/bin/false|exit|return|echo|/bin/echo|printf|sleep|test|'['|'[['|']]' \
        |cd|pwd|export|set|unset|cat|ls|which|type|'#'*|')'|'}'|wait) continue ;;
      *) return 1 ;;
    esac
  done < <(printf '%s\n' "$c" | sed -E 's/(\|\||&&|;|\||&)/\n/g')
  return 0
}

check_words() { # check_words NAME VALUE forbidden-regex
  local name="$1" val="$2" bad="$3"
  [[ -n "$(trim "$val")" ]] || die 2 "$name is empty"
  [[ "$val" =~ ^[A-Za-z0-9_.:/=,\ -]+$ ]] || die 2 "$name has unexpected characters: $val"
  if [[ " $val " =~ $bad ]]; then die 2 "$name would skip the real work: $val"; fi
}

validate_settings() {
  local k v
  # removed or environment-only knobs that used to weaken the run
  [[ -z "${ALLOW_FLAKY:-}" || "${ALLOW_FLAKY}" == 0 ]] || die 2 "ALLOW_FLAKY is not supported: a flaky test always fails the run"

  COVERAGE_MIN="${COVERAGE_MIN:-$COVERAGE_FLOOR}"
  if ! [[ "$COVERAGE_MIN" =~ ^[0-9]{1,3}$ ]] || (( 10#$COVERAGE_MIN < COVERAGE_FLOOR || 10#$COVERAGE_MIN > 100 )); then
    die 2 "COVERAGE_MIN=$COVERAGE_MIN refused: must be an integer between $COVERAGE_FLOOR and 100"
  fi
  FLAKY_RERUNS="${FLAKY_RERUNS:-$FLAKY_RERUNS_FLOOR}"
  if ! [[ "$FLAKY_RERUNS" =~ ^[0-9]$ ]] || (( FLAKY_RERUNS < FLAKY_RERUNS_FLOOR || FLAKY_RERUNS > FLAKY_RERUNS_MAX )); then
    die 2 "FLAKY_RERUNS=$FLAKY_RERUNS refused: must be between $FLAKY_RERUNS_FLOOR and $FLAKY_RERUNS_MAX"
  fi
  DC_FAIL_CVSS="${DC_FAIL_CVSS:-$DC_CVSS_CEILING}"
  if ! [[ "$DC_FAIL_CVSS" =~ ^[0-9]{1,2}(\.[0-9])?$ ]] \
     || ! awk -v a="$DC_FAIL_CVSS" -v b="$DC_CVSS_CEILING" 'BEGIN{exit !(a>0 && a<=b)}'; then
    die 2 "DC_FAIL_CVSS=$DC_FAIL_CVSS refused: must be above 0 and at most $DC_CVSS_CEILING"
  fi
  export DC_FAIL_CVSS
  HADOLINT_THRESHOLD="${HADOLINT_THRESHOLD:-warning}"
  in_list "$HADOLINT_THRESHOLD" "warning info style" || die 2 "HADOLINT_THRESHOLD=$HADOLINT_THRESHOLD refused: warning, info or style"
  REQUIRE_DEVICE="${REQUIRE_DEVICE:-0}";             in_list "$REQUIRE_DEVICE" "0 1" || die 2 "REQUIRE_DEVICE must be 0 or 1"
  SECRETS_FULL_HISTORY="${SECRETS_FULL_HISTORY:-0}"; in_list "$SECRETS_FULL_HISTORY" "0 1" || die 2 "SECRETS_FULL_HISTORY must be 0 or 1"
  if [[ -n "${E2E_RUNNER:-}" ]]; then in_list "$E2E_RUNNER" "cypress playwright" || die 2 "E2E_RUNNER must be cypress or playwright"; fi
  CYPRESS_BROWSER="${CYPRESS_BROWSER:-chrome}"
  [[ "$CYPRESS_BROWSER" =~ ^[a-z][a-z0-9:-]*$ ]] || die 2 "CYPRESS_BROWSER has unexpected characters"

  BASE_REF="${BASE_REF:-origin/main}"
  [[ "$BASE_REF" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ && "$BASE_REF" != *..* ]] || die 2 "BASE_REF has unexpected characters: $BASE_REF"
  RESULTS_DIR="${RESULTS_DIR:-test-results}"
  [[ "$RESULTS_DIR" =~ ^[A-Za-z0-9._-][A-Za-z0-9._/-]*$ && "$RESULTS_DIR" != *..* ]] || die 2 "RESULTS_DIR must be a relative path inside the repo"
  if [[ -n "${DC_SUPPRESSION:-}" ]]; then
    [[ "$DC_SUPPRESSION" =~ ^[A-Za-z0-9._-][A-Za-z0-9._/-]*$ && "$DC_SUPPRESSION" != *..* && -f "$DC_SUPPRESSION" ]] \
      || die 2 "DC_SUPPRESSION must be an existing file inside the repo"
    DC_SUPPRESSION="$ROOT/$DC_SUPPRESSION"; export DC_SUPPRESSION
  fi
  if [[ -n "${SEMGREP_EXTRA_CONFIG:-}" ]]; then
    [[ "$SEMGREP_EXTRA_CONFIG" =~ ^[A-Za-z0-9._/:-]+$ ]] || die 2 "SEMGREP_EXTRA_CONFIG has unexpected characters"
  fi

  SECURITY_CHECKS="$(trim "${SECURITY_CHECKS:-$ALL_SECURITY_CHECKS}")"
  [[ -n "$SECURITY_CHECKS" ]] || die 2 "SECURITY_CHECKS is empty"
  for k in $SECURITY_CHECKS; do in_list "$k" "$ALL_SECURITY_CHECKS" || die 2 "unknown security check: $k"; done
  SAST_TOOL="${SAST_TOOL:-semgrep}"
  # test services stay on loopback: most dev servers read HOST
  HOST="${HOST:-127.0.0.1}"
  in_list "$HOST" "127.0.0.1 localhost ::1" || die 2 "HOST=$HOST refused: test services must listen on 127.0.0.1"
  export HOST
  in_list "$SAST_TOOL" "semgrep codeql-ci" || die 2 "SAST_TOOL must be semgrep or codeql-ci"
  KEEP_TEST_DB="${KEEP_TEST_DB:-0}"; in_list "$KEEP_TEST_DB" "0 1" || die 2 "KEEP_TEST_DB must be 0 or 1"
  if [[ -n "${TEST_DATABASE_URL:-}" ]] \
     && ! [[ "$TEST_DATABASE_URL" =~ ^postgres(ql)?://[^@/]+@(127\.0\.0\.1|localhost)(:[0-9]+)?/[A-Za-z0-9_]+$ ]]; then
    die 2 "TEST_DATABASE_URL refused: expected postgresql://user:password@127.0.0.1:port/db"
  fi

  for k in LINT_CMD UNIT_CMD FUNCTIONAL_CMD REGRESSION_CMD; do
    [[ -n "${!k+set}" ]] || continue
    if trivial_cmd "${!k}"; then die 2 "$k refused: empty, no-op or failure-masking command: ${!k}"; fi
  done
  local gradle_bad='[[:space:]](help|tasks|projects|properties|dependencies|-m|--dry-run|-x|--exclude-task|--continue)[[:space:]]'
  for k in GRADLE_UNIT_TASKS GRADLE_FUNCTIONAL_TASKS GRADLE_REGRESSION_TASKS; do
    [[ -n "${!k+set}" ]] && check_words "$k" "${!k}" "$gradle_bad"
  done
  [[ -n "${GRADLE_LINT_TASKS+set}" ]] && check_words GRADLE_LINT_TASKS "$GRADLE_LINT_TASKS" \
    '[[:space:]](help|tasks|projects|properties|dependencies|-m|--dry-run|--continue)[[:space:]]'
  for k in CTEST_UNIT_ARGS CTEST_FUNCTIONAL_ARGS; do
    [[ -n "${!k+set}" ]] && check_words "$k" "${!k}" '[[:space:]](-N|--show-only[^[:space:]]*|-E|--exclude-regex)[[:space:]]'
  done
  for k in MAKE_UNIT_TARGET MAKE_REGRESSION_TARGET; do
    [[ -n "${!k+set}" ]] && check_words "$k" "${!k}" '[[:space:]](-n|--just-print|--dry-run|--recon|-i|--ignore-errors|-k|--keep-going|-q|--question)[[:space:]]'
  done
  for k in C_SRC_DIRS C_BUILD; do
    [[ -n "${!k+set}" ]] && check_words "$k" "${!k}" '[[:space:]]-'
  done
  return 0
}

load_settings
validate_settings
SUMMARY="$RESULTS_DIR/pipeline-summary.md"
mkdir -p "$RESULTS_DIR"

# ---------- summary, exemptions, completeness, final report ----------
SUMMARY_READY=0
CURRENT_STAGE=""
declare -A EXEMPT_USED=()
declare -A STAGE_RESULT=()
REQUIRED=()
SKIPPED=()
record() { [[ $SUMMARY_READY -eq 1 ]] && printf '| %s | %s | %s |\n' "$1" "$2" "${3//|/\\|}" >>"$SUMMARY"; return 0; }

# exempt VAR: true when VAR holds a usable justification, which is then kept for the summary.
exempt() {
  local name="$1" val
  val="$(trim "${!1:-}")"
  [[ -n "$val" ]] || return 1
  [[ ${#val} -ge $MIN_REASON_LEN ]] \
    || die 2 "$name is set but too short (${#val} chars, need $MIN_REASON_LEN). Write why the gate cannot apply."
  EXEMPT_USED[$name]="$val"
  return 0
}

finish() {
  local rc=$?
  test_db_down
  [[ $SUMMARY_READY -eq 1 ]] || exit "$rc"
  {
    echo
    echo "Settings: COVERAGE_MIN=$COVERAGE_MIN FLAKY_RERUNS=$FLAKY_RERUNS DC_FAIL_CVSS=$DC_FAIL_CVSS HADOLINT_THRESHOLD=$HADOLINT_THRESHOLD BASE_REF=$BASE_REF"
    [[ ${#FILE_SET[@]} -gt 0 ]] && echo "Set from .test-pipeline.env: ${FILE_SET[*]}"
    echo "Required: ${REQUIRED[*]:-none}"
    if [[ ${#EXEMPT_USED[@]} -gt 0 ]]; then
      echo
      echo "## Exemptions used"
      echo
      local k
      for k in "${!EXEMPT_USED[@]}"; do printf -- '- %s: %s\n' "$k" "${EXEMPT_USED[$k]}"; done
    fi
    [[ ${#SKIPPED[@]} -gt 0 ]] && { echo; echo "Skipped with exemption: ${SKIPPED[*]}"; }
    echo
    if [[ $rc -eq 0 ]]; then echo "Result: PASS"; else echo "Result: FAIL (exit $rc${CURRENT_STAGE:+, stage $CURRENT_STAGE})"; fi
  } >>"$SUMMARY"
  echo
  log "summary ($SUMMARY):"
  cat "$SUMMARY"
  exit "$rc"
}
trap finish EXIT

# ---------- test database (Taskora) ----------
# The API, functional and E2E tests run on a real PostgreSQL. The CI gives TEST_DATABASE_URL through a
# service container; locally scripts/test-db.sh starts a throwaway one bound to 127.0.0.1.
STARTED_TEST_DB=0
test_db_up() {
  if [[ -n "${TEST_DATABASE_URL:-}" ]]; then log "test database: given by TEST_DATABASE_URL"; return 0; fi
  # in CI the workflow provides the database, a missing URL means the workflow is wrong
  [[ "${CI:-}" != true ]] || die 4 "TEST_DATABASE_URL must come from the CI workflow (postgres service)"
  [[ -x scripts/test-db.sh ]] || die 4 "TEST_DATABASE_URL is not set and scripts/test-db.sh is missing"
  local url
  url="$(scripts/test-db.sh start)" || die 4 "could not start the test database (is Docker running?)"
  STARTED_TEST_DB=1
  export TEST_DATABASE_URL="$url"
  log "test database: $url"
}
# no stage runs without a reachable Postgres whose role can create the per-test databases
test_db_check() {
  [[ -f test/scripts/check-test-db.mjs ]] || return 0
  node test/scripts/check-test-db.mjs || die 4 "the test database is not usable, see above"
}
test_db_down() {
  if [[ ${STARTED_TEST_DB:-0} -eq 1 && "${KEEP_TEST_DB:-0}" != 1 ]]; then scripts/test-db.sh stop || warn "could not stop the test database"; fi
  return 0
}

# A gate failure (missing runner or tool, nothing to run, coverage not measurable) is not flaky: no reruns.
GATE_FAIL=""
gate_fail() { GATE_FAIL="$*"; err "$*"; return 1; }

# ---------- stack detection ----------
STACKS=()
detect_stacks() {
  STACKS=()
  if [[ -f package.json ]]; then STACKS+=(node); fi
  if [[ -f build.gradle || -f build.gradle.kts || -f settings.gradle || -f settings.gradle.kts ]]; then
    if grep -rqsE 'com\.android\.(application|library)' --include='*.gradle*' --exclude-dir=node_modules .; then
      STACKS+=(android)
    else
      STACKS+=(gradle)
    fi
  fi
  if [[ -f CMakeLists.txt ]]; then STACKS+=(c_cmake); elif [[ -f Makefile ]]; then STACKS+=(c_make); fi
  if [[ -f pyproject.toml || -f setup.py || -f pytest.ini ]]; then STACKS+=(python); fi
}
has_stack() { in_list "$1" "${STACKS[*]:-}"; }

# ---------- node helpers ----------
pm() {
  if [[ -f pnpm-lock.yaml ]]; then echo pnpm
  elif [[ -f yarn.lock ]]; then echo yarn
  else echo npm; fi
}
has_script() { node -e "process.exit(require('./package.json').scripts?.[process.argv[1]] ? 0 : 1)" "$1" 2>/dev/null; }
has_dep() {
  node -e "const p=require('./package.json');process.exit({...p.dependencies,...p.devDependencies}[process.argv[1]]?0:1)" "$1" 2>/dev/null
}
run_script() { local p; p="$(pm)"; if [[ "$p" == npm ]]; then npm run --silent "$@"; else "$p" run "$@"; fi; }
e2e_runner() {
  if [[ -n "${E2E_RUNNER:-}" ]]; then echo "$E2E_RUNNER"
  elif has_dep cypress || compgen -G 'cypress.config.*' >/dev/null; then echo cypress
  elif has_dep @playwright/test || compgen -G 'playwright.config.*' >/dev/null; then echo playwright
  else echo none; fi
}
functional_missing() { # $1 = what is missing
  if exempt E2E_EXEMPT_REASON; then
    warn "$1, accepted by E2E_EXEMPT_REASON"; SKIPPED+=("$CURRENT_STAGE:$1"); return 0
  fi
  gate_fail "$1. Fix it, or set E2E_EXEMPT_REASON with a written justification."
}
run_e2e() { # $1 = optional spec filter
  local runner; runner="$(e2e_runner)"
  case "$runner" in
    cypress)
      if [[ -n "${1:-}" ]]; then npx --no-install cypress run --browser "$CYPRESS_BROWSER" --spec "$1"
      else npx --no-install cypress run --browser "$CYPRESS_BROWSER"; fi ;;
    playwright) if [[ -n "${1:-}" ]]; then npx --no-install playwright test "$1"; else npx --no-install playwright test; fi ;;
    *) functional_missing "no E2E runner (cypress or playwright) found" ;;
  esac
}

# ---------- per-stack stages ----------
# Stage functions run inside an `if`, where set -e is off, so each step returns on failure explicitly.
node_lint() {
  if has_script lint; then run_script lint || return 1; else npx --no-install eslint . || return 1; fi
  if has_script typecheck; then run_script typecheck
  elif [[ -f tsconfig.json ]]; then npx --no-install tsc --noEmit; fi
}
node_unit() {
  if has_script test:unit; then run_script test:unit
  elif has_dep vitest; then npx --no-install vitest run --coverage
  elif has_dep jest; then npx --no-install jest --coverage --ci
  elif has_script test; then run_script test
  else gate_fail "no unit test runner found for node (test:unit or test script, vitest or jest)"; fi
}
node_functional() { if has_script test:e2e && [[ -z "${E2E_SPEC:-}" ]]; then run_script test:e2e; else run_e2e "${E2E_SPEC:-}"; fi; }
node_regression() {
  if has_script test:regression; then run_script test:regression; else node_unit && run_e2e ""; fi
}

gradle_cmd() { if [[ -x ./gradlew ]]; then echo ./gradlew; else echo gradle; fi; }
android_lint()       { sx "$(gradle_cmd)" --no-daemon "${GRADLE_LINT_TASKS:-lint}"; }
android_unit()       { sx "$(gradle_cmd)" --no-daemon "${GRADLE_UNIT_TASKS:-testDebugUnitTest}"; }
android_functional() {
  if has adb && adb get-state >/dev/null 2>&1; then
    sx "$(gradle_cmd)" --no-daemon "${GRADLE_FUNCTIONAL_TASKS:-connectedDebugAndroidTest}"
  elif [[ "$REQUIRE_DEVICE" == 1 ]]; then gate_fail "no device or emulator and REQUIRE_DEVICE=1"
  else functional_missing "no device or emulator for instrumented tests"
  fi
}
android_regression() { sx "$(gradle_cmd)" --no-daemon "${GRADLE_REGRESSION_TASKS:-check}"; }
gradle_lint()        { sx "$(gradle_cmd)" --no-daemon "${GRADLE_LINT_TASKS:-check -x test}"; }
gradle_unit()        { sx "$(gradle_cmd)" --no-daemon "${GRADLE_UNIT_TASKS:-test}"; }
gradle_functional()  { sx "$(gradle_cmd)" --no-daemon "${GRADLE_FUNCTIONAL_TASKS:-integrationTest}"; }
gradle_regression()  { sx "$(gradle_cmd)" --no-daemon "${GRADLE_REGRESSION_TASKS:-check}"; }

C_BUILD="${C_BUILD:-build-test}"
c_configure() {
  [[ -f "$C_BUILD/CMakeCache.txt" ]] && return 0
  cmake -S . -B "$C_BUILD" -DCMAKE_BUILD_TYPE=Debug -DCMAKE_EXPORT_COMPILE_COMMANDS=ON \
    -DCMAKE_C_FLAGS="--coverage -fsanitize=address,undefined -fno-omit-frame-pointer" \
    -DCMAKE_CXX_FLAGS="--coverage -fsanitize=address,undefined -fno-omit-frame-pointer" \
    -DCMAKE_EXE_LINKER_FLAGS="--coverage -fsanitize=address,undefined"
}
c_static() {
  has cppcheck || { gate_fail "cppcheck is not installed"; return 1; }
  sx cppcheck --error-exitcode=1 --enable=warning,style,performance,portability --inline-suppr \
    --suppress=missingIncludeSystem -q "${C_SRC_DIRS:-src include}"
}
c_cmake_lint() {
  c_configure || return 1
  c_static || return 1
  if has run-clang-tidy; then run-clang-tidy -p "$C_BUILD" -quiet
  elif has clang-tidy; then
    local -a dirs; read -ra dirs <<<"${C_SRC_DIRS:-src}"
    find "${dirs[@]}" -name '*.c' -print0 | xargs -0 -r clang-tidy -p "$C_BUILD" --quiet
  else gate_fail "clang-tidy is not installed"; fi
}
c_cmake_unit() {
  c_configure || return 1
  cmake --build "$C_BUILD" -j"$(nproc)" || return 1
  sx ctest --test-dir "$C_BUILD" --output-on-failure --no-tests=error "${CTEST_UNIT_ARGS:--L unit}"
}
c_cmake_functional() {
  cmake --build "$C_BUILD" -j"$(nproc)" || return 1
  local rc=0
  sx ctest --test-dir "$C_BUILD" --output-on-failure --no-tests=error "${CTEST_FUNCTIONAL_ARGS:--L functional}" || rc=$?
  if [[ $rc -ne 0 ]] && ! sx ctest --test-dir "$C_BUILD" -N "${CTEST_FUNCTIONAL_ARGS:--L functional}" | grep -q 'Test *#'; then
    functional_missing "no functional ctest found"; return
  fi
  return "$rc"
}
c_cmake_regression() {
  cmake --build "$C_BUILD" -j"$(nproc)" || return 1
  ctest --test-dir "$C_BUILD" --output-on-failure --no-tests=error || return 1
  # gcovr writes coverage-c.xml, which the changed-code coverage gate then reads
  has gcovr || { gate_fail "gcovr is not installed, C coverage cannot be measured"; return 1; }
  gcovr -r . "$C_BUILD" --fail-under-line "$COVERAGE_MIN" --xml "$RESULTS_DIR/coverage-c.xml"
}
c_make_lint()       { c_static; }
c_make_unit()       { sx make "${MAKE_UNIT_TARGET:-test}"; }
c_make_functional() { if make -n functional >/dev/null 2>&1; then make functional; else functional_missing "no 'functional' make target"; fi; }
c_make_regression() { sx make "${MAKE_REGRESSION_TARGET:-check}"; }

python_lint() {
  has ruff || { gate_fail "ruff is not installed"; return 1; }
  { ruff check . && ruff format --check .; } || return 1
  if has mypy && [[ -f mypy.ini || -f pyproject.toml ]]; then mypy . || return 1; fi
}
python_unit()       { pytest -m "not functional" --cov --cov-report=xml:"$RESULTS_DIR/coverage-py.xml" -q; }
python_functional() {
  local rc=0; pytest -m functional -q || rc=$?
  if [[ $rc -eq 5 ]]; then functional_missing "no functional pytest collected"; return; fi
  return "$rc"
}
python_regression() { pytest -q; }

# ---------- security stage ----------
SEC_FAILED=0
sec_ok()   { record "security/$1" PASS "$2"; }
sec_fail() { record "security/$1" FAIL "$2"; err "[security/$1] $2"; SEC_FAILED=1; }
need() { # need <check> <tool>...: a missing tool fails the check, there is no exemption for it
  local check="$1" t missing=(); shift
  for t in "$@"; do has "$t" || missing+=("$t"); done
  [[ ${#missing[@]} -eq 0 ]] && return 0
  sec_fail "$check" "required tool not installed: ${missing[*]} (see scripts/ci-install-tools.sh)"
  return 1
}

sec_secrets() {
  need secrets gitleaks || return 0
  local -a common=(--redact --no-banner --exit-code 1 --report-format json)
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if gitleaks dir "${common[@]}" --report-path "$RESULTS_DIR/gitleaks-dir.json" .; then
      sec_ok secrets "no secret in the working tree (not a git repository)"
    else sec_fail secrets "secrets found in the working tree, see $RESULTS_DIR/gitleaks-dir.json"; fi
    return 0
  fi
  local range="" what="full history" rc=0 broken=0
  if [[ "$SECRETS_FULL_HISTORY" != 1 ]] && git rev-parse --verify -q "$BASE_REF^{commit}" >/dev/null \
     && [[ "$(git rev-list --count "$BASE_REF..HEAD")" -gt 0 ]]; then
    range="$BASE_REF..HEAD"; what="commits $range"
  fi
  if git rev-parse --verify -q HEAD >/dev/null; then
    # gitleaks reports "0 commits scanned" and no leak when git log fails under it (for example a
    # "dubious ownership" refusal in a container), so check it really read the expected commits.
    local expected scanned glog="$RESULTS_DIR/gitleaks-history.log"
    if [[ -n "$range" ]]; then expected="$(git rev-list --no-merges --count "$range")"
    else expected="$(git rev-list --no-merges --count --all)"; fi
    gitleaks git "${common[@]}" --report-path "$RESULTS_DIR/gitleaks-history.json" ${range:+--log-opts="$range"} . 2>"$glog" || rc=1
    cat "$glog" >&2
    scanned="$(sed -e $'s/\x1b\\[[0-9;]*m//g' "$glog" | sed -n 's/.*[^0-9]\([0-9][0-9]*\) commits scanned.*/\1/p' | tail -n 1)"
    if [[ "$expected" -gt 0 && "${scanned:-0}" -eq 0 ]]; then
      broken=1; err "gitleaks scanned 0 of $expected commits, the history scan did not run"
    fi
  fi
  # staged and unstaged changes to tracked files
  gitleaks git "${common[@]}" --report-path "$RESULTS_DIR/gitleaks-staged.json" --pre-commit --staged . || rc=1
  gitleaks git "${common[@]}" --report-path "$RESULTS_DIR/gitleaks-worktree.json" --pre-commit . || rc=1
  # new files not yet tracked (ignored files stay out)
  local tmp; tmp="$(mktemp -d)"
  if ! git ls-files -z --others --exclude-standard | tar --null --no-recursion -T - -cf - | tar -xf - -C "$tmp"; then
    rc=1; err "could not collect untracked files for the secret scan"
  elif [[ -n "$(ls -A "$tmp")" ]]; then
    gitleaks dir "${common[@]}" --report-path "$RESULTS_DIR/gitleaks-untracked.json" "$tmp" || rc=1
  fi
  rm -rf "$tmp"
  if [[ $broken -eq 1 ]]; then sec_fail secrets "history scan read no commit (git refused or failed under gitleaks)"
  elif [[ $rc -eq 0 ]]; then sec_ok secrets "gitleaks clean ($what, staged, unstaged, untracked)"
  else sec_fail secrets "gitleaks found secrets, reports in $RESULTS_DIR/gitleaks-*.json (values redacted)"; fi
}

sec_sca() {
  local rc=0 osv_rc=0 notes=()
  if need sca osv-scanner; then
    osv-scanner scan source -r --format json --output-file "$RESULTS_DIR/osv-scanner.json" . >/dev/null || osv_rc=$?
    case $osv_rc in
      0) notes+=("osv-scanner clean") ;;
      1) osv-scanner scan source -r . || true; rc=1; notes+=("osv-scanner found vulnerabilities") ;;
      128)
        if has_stack node || has_stack android || has_stack gradle || has_stack python; then
          rc=1; notes+=("osv-scanner found no lockfile although a package manager is used, commit one")
        else notes+=("osv-scanner: no package manifest"); fi ;;
      *) rc=1; notes+=("osv-scanner error (exit $osv_rc)") ;;
    esac
  else rc=1; fi

  if has_stack node; then
    case "$(pm)" in
      npm)
        if [[ ! -f package-lock.json ]]; then rc=1; notes+=("no package-lock.json for npm audit")
        elif need sca npm && npm audit --package-lock-only --audit-level=high; then notes+=("npm audit: no high or critical")
        else rc=1; notes+=("npm audit: high or critical vulnerabilities"); fi ;;
      pnpm)
        if need sca pnpm && pnpm audit --audit-level high; then notes+=("pnpm audit: no high or critical")
        else rc=1; notes+=("pnpm audit: high or critical vulnerabilities"); fi ;;
      yarn)
        if ! need sca yarn; then rc=1
        elif [[ "$(yarn --version)" == 1.* ]]; then
          # yarn 1 exit code is a bit mask, 8 = high and 16 = critical
          local yrc=0; yarn audit --groups dependencies devDependencies || yrc=$?
          if (( yrc & 24 )); then rc=1; notes+=("yarn audit: high or critical vulnerabilities")
          else notes+=("yarn audit: no high or critical"); fi
        elif yarn npm audit --all --recursive --severity high; then notes+=("yarn npm audit: no high or critical")
        else rc=1; notes+=("yarn npm audit: high or critical vulnerabilities"); fi ;;
    esac
  fi

  if has_stack android || has_stack gradle; then
    [[ -n "${NVD_API_KEY:-}" ]] || warn "NVD_API_KEY is not set, the NVD download will be very slow"
    if DC_REPORT_DIR="$ROOT/$RESULTS_DIR/dependency-check" \
       "$(gradle_cmd)" --no-daemon --init-script "$ROOT/scripts/security/dependency-check.init.gradle" dependencyCheckAggregate; then
      notes+=("dependency-check: nothing at or above CVSS $DC_FAIL_CVSS")
    else rc=1; notes+=("dependency-check failed or found CVSS >= $DC_FAIL_CVSS, see $RESULTS_DIR/dependency-check"); fi
  fi

  local joined="" n
  for n in "${notes[@]}"; do joined="${joined:+$joined; }$n"; done
  if [[ $rc -eq 0 ]]; then sec_ok sca "$joined"; else sec_fail sca "${joined:-osv-scanner missing}"; fi
}

sec_sast() {
  case "$SAST_TOOL" in
    semgrep)
      need sast semgrep || return 0
      local -a cfg=(--config p/default)
      [[ -n "${SEMGREP_EXTRA_CONFIG:-}" ]] && cfg+=(--config "$SEMGREP_EXTRA_CONFIG")
      if semgrep scan "${cfg[@]}" --error --metrics=off --quiet --json-output="$RESULTS_DIR/semgrep.json" .; then
        sec_ok sast "semgrep clean"
      else sec_fail sast "semgrep findings or error, see $RESULTS_DIR/semgrep.json"; fi ;;
    codeql-ci)
      if [[ "${GITHUB_ACTIONS:-}" == true ]]; then record security/sast DELEGATED "CodeQL job of the workflow"
      else sec_fail sast "SAST_TOOL=codeql-ci is only valid inside GitHub Actions, use semgrep locally"; fi ;;
  esac
}

sec_dockerfile() {
  local -a files=()
  while IFS= read -r -d '' f; do files+=("$f"); done < <(find . \( -name node_modules -o -name .git -o -name .tools \) -prune -o \
    -type f \( -name Dockerfile -o -name 'Dockerfile.*' -o -name '*.Dockerfile' -o -name Containerfile \) -print0)
  if [[ ${#files[@]} -eq 0 ]]; then record security/dockerfile N/A "no Dockerfile"; return 0; fi
  need dockerfile hadolint || return 0
  if hadolint --failure-threshold "$HADOLINT_THRESHOLD" "${files[@]}"; then
    sec_ok dockerfile "hadolint clean on ${#files[@]} file(s)"
  else sec_fail dockerfile "hadolint findings at or above $HADOLINT_THRESHOLD"; fi
}

sec_workflows() {
  if [[ ! -d .github/workflows ]]; then record security/workflows N/A "no workflow"; return 0; fi
  need workflows actionlint zizmor || return 0
  local rc=0
  actionlint || rc=1
  zizmor --offline --no-progress .github/workflows || rc=1
  if [[ $rc -eq 0 ]]; then sec_ok workflows "actionlint and zizmor clean"
  else sec_fail workflows "actionlint or zizmor findings"; fi
}

run_security() {
  local c
  log "=== stage: security ($SECURITY_CHECKS) ==="
  for c in $SECURITY_CHECKS; do log "[security] $c"; "sec_$c"; done
  [[ $SEC_FAILED -eq 0 ]]
}

# ---------- stage runner with flakiness detection ----------
run_stage() { # $1 stage
  local stage="$1" override_var cmd stack
  override_var="$(tr '[:lower:]' '[:upper:]' <<<"$stage")_CMD"
  cmd="${!override_var:-}"
  attempt() {
    GATE_FAIL=""
    if [[ -n "$cmd" ]]; then bash -c "$cmd"; return; fi
    [[ ${#STACKS[@]} -gt 0 ]] || { gate_fail "nothing to run for stage $stage (no stack, no $override_var)"; return 1; }
    for stack in "${STACKS[@]}"; do
      log "[$stage] $stack"
      "${stack}_${stage}" || return 1
    done
  }
  log "=== stage: $stage ==="
  if attempt; then record "$stage" PASS "first run"; STAGE_RESULT[$stage]=PASS; return 0; fi
  if [[ -n "$GATE_FAIL" ]]; then record "$stage" FAIL "$GATE_FAIL"; STAGE_RESULT[$stage]=FAIL; return 1; fi
  local i
  for ((i = 1; i <= FLAKY_RERUNS; i++)); do
    warn "[$stage] failed, rerun $i/$FLAKY_RERUNS to detect flakiness"
    if attempt; then
      record "$stage" FLAKY "passed on rerun $i, a flaky test is a failure: remove the nondeterminism"
      STAGE_RESULT[$stage]=FLAKY
      return 2
    fi
  done
  record "$stage" FAIL "failed $((FLAKY_RERUNS + 1)) times (deterministic)"
  STAGE_RESULT[$stage]=FAIL
  return 1
}

# Changed-code coverage. Not being able to measure it is a failure, unless COVERAGE_EXEMPT_REASON says why.
changed_coverage() {
  local why="" reports=() f
  if ! has diff-cover; then why="diff-cover is not installed"
  elif ! git rev-parse --verify -q "$BASE_REF^{commit}" >/dev/null; then why="base ref $BASE_REF not found"
  else
    while IFS= read -r -d '' f; do reports+=("$f"); done < <(find . \( -name node_modules -o -name .git \) -prune -o -type f \
      \( -name 'cobertura-coverage.xml' -o -name 'coverage*.xml' -o -name 'jacocoTestReport.xml' \) -print0 2>/dev/null)
    [[ ${#reports[@]} -gt 0 ]] || why="no coverage XML report found"
  fi
  if [[ -n "$why" ]]; then
    if exempt COVERAGE_EXEMPT_REASON; then
      warn "changed-code coverage not measured ($why), accepted by COVERAGE_EXEMPT_REASON"
      record coverage EXEMPT "not measured: $why"; STAGE_RESULT[coverage]=EXEMPT; return 0
    fi
    record coverage FAIL "not measured: $why. Fix it, or set COVERAGE_EXEMPT_REASON with a written justification"
    err "changed-code coverage not measured: $why"
    return 1
  fi
  if diff-cover "${reports[@]}" --compare-branch="$BASE_REF" --fail-under="$COVERAGE_MIN" \
       --markdown-report "$RESULTS_DIR/diff-coverage.md"; then
    record coverage PASS ">= ${COVERAGE_MIN}% on changed lines"; STAGE_RESULT[coverage]=PASS
  else
    record coverage FAIL "< ${COVERAGE_MIN}% on changed lines"; return 1
  fi
}

# Every required stage must have run and ended PASS (or EXEMPT for coverage). Anything else is an incomplete run.
check_complete() {
  local s missing=()
  for s in "${REQUIRED[@]}"; do
    case "${STAGE_RESULT[$s]:-NOT RUN}" in
      PASS) ;;
      EXEMPT) [[ "$s" == coverage ]] || missing+=("$s=EXEMPT") ;;
      *) missing+=("$s=${STAGE_RESULT[$s]:-NOT RUN}") ;;
    esac
  done
  [[ ${#missing[@]} -eq 0 ]] && return 0
  record completeness FAIL "required stages not passed: ${missing[*]}"
  err "incomplete run, required stages not passed: ${missing[*]}"
  return 1
}

main() {
  if [[ "${1:-}" == --check-config ]]; then
    log "settings OK: COVERAGE_MIN=$COVERAGE_MIN FLAKY_RERUNS=$FLAKY_RERUNS DC_FAIL_CVSS=$DC_FAIL_CVSS HADOLINT_THRESHOLD=$HADOLINT_THRESHOLD"
    log "set from .test-pipeline.env: ${FILE_SET[*]:-nothing}"
    log "floors: COVERAGE_FLOOR=$COVERAGE_FLOOR FLAKY_RERUNS_FLOOR=$FLAKY_RERUNS_FLOOR DC_CVSS_CEILING=$DC_CVSS_CEILING"
    exit 0
  fi
  local stages=("$@") s rc
  [[ ${#stages[@]} -eq 0 ]] && read -ra stages <<<"$ALL_STAGES"
  for s in "${stages[@]}"; do in_list "$s" "$ALL_STAGES" || die 2 "unknown stage: $s"; done
  # the run must include every stage the caller requires (the CI passes its list)
  for s in ${PIPELINE_REQUIRED_STAGES:-}; do
    in_list "$s" "$ALL_STAGES" || die 2 "unknown stage in PIPELINE_REQUIRED_STAGES: $s"
    in_list "$s" "${stages[*]}" || die 80 "required stage $s is not part of this run"
  done
  REQUIRED=("${stages[@]}")
  in_list regression "${stages[*]}" && REQUIRED+=(coverage)

  detect_stacks
  local only_security=1
  for s in "${stages[@]}"; do [[ "$s" == security ]] || only_security=0; done
  if [[ $only_security -eq 0 && ${#STACKS[@]} -eq 0 && -z "${LINT_CMD:-}${UNIT_CMD:-}${FUNCTIONAL_CMD:-}${REGRESSION_CMD:-}" ]]; then
    die 3 "no supported stack detected"
  fi
  log "detected stacks: ${STACKS[*]:-custom}"
  local node_info=""
  if has_stack node && [[ $only_security -eq 0 ]]; then
    has node || die 2 "node is not installed"
    local nv; nv="$(node -p 'process.versions.node')"
    (( ${nv%%.*} >= NODE_MAJOR_MIN )) || die 2 "Node $nv is too old, $NODE_MAJOR_MIN or later is required (check which node this shell resolves)"
    node_info="Node: v$nv ($(command -v node))"
  fi
  if [[ $only_security -eq 0 ]]; then test_db_up; test_db_check; fi
  { echo "# Test pipeline summary ($(date -Iseconds))"; echo; echo "Stacks: ${STACKS[*]:-custom}"
    [[ -n "$node_info" ]] && echo "$node_info"
    echo
    echo "| Stage | Result | Detail |"; echo "|---|---|---|"; } >"$SUMMARY"
  SUMMARY_READY=1

  declare -A codes=([lint]=10 [unit]=20 [functional]=30 [regression]=40)
  for s in "${stages[@]}"; do
    CURRENT_STAGE="$s"
    if [[ "$s" == security ]]; then
      if run_security; then STAGE_RESULT[security]=PASS; else STAGE_RESULT[security]=FAIL; log "stage security FAILED"; exit 70; fi
      continue
    fi
    rc=0; run_stage "$s" || rc=$?
    if [[ $rc -eq 2 ]]; then log "flaky test detected in $s"; exit 60; fi
    if [[ $rc -ne 0 ]]; then log "stage $s FAILED"; exit "${codes[$s]}"; fi
    if [[ "$s" == regression ]]; then
      CURRENT_STAGE=coverage
      changed_coverage || exit 50
    fi
  done
  CURRENT_STAGE=completeness
  check_complete || exit 80
  CURRENT_STAGE=""
  log "all required stages passed: ${REQUIRED[*]}"
}

main "$@"

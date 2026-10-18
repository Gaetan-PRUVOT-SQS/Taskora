#!/usr/bin/env bash
# test-pipeline.sh - generic feature test pipeline: lint -> unit -> functional -> regression
# Auto-detects stacks: Node (Cypress/Playwright/Jest/Vitest), Android/Gradle, C (CMake/Make), Python.
#
# Usage: scripts/test-pipeline.sh [stage ...]      stages: lint unit functional regression (default: all)
# Env / .test-pipeline.env overrides:
#   LINT_CMD UNIT_CMD FUNCTIONAL_CMD REGRESSION_CMD  custom command per stage (replaces auto-detection)
#   E2E_RUNNER=cypress|playwright   force E2E runner (default: cypress if present)
#   E2E_SPEC=<glob>                 restrict the functional stage to the feature's specs
#   COVERAGE_MIN=80                 min line coverage (%) on changed code (diff-cover) / C (gcovr)
#   FLAKY_RERUNS=2                  reruns of a failed stage to detect flakiness
#   ALLOW_FLAKY=0                   1 = a stage that passes on rerun is accepted (still reported)
#   BASE_REF=origin/main            base branch for changed-code coverage
#   REQUIRE_DEVICE=0                1 = Android instrumented tests are mandatory (fail if no device)
#   SERVICES_UP_CMD / SERVICES_DOWN_CMD  run in this shell before the stages / on exit
#                                   (Taskora: start and stop the Postgres test container)
# Exit codes: 0 OK | 2 usage | 3 no stack | 4 services | 10 lint | 20 unit | 30 functional | 40 regression
#             | 50 coverage | 60 flaky test detected
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck disable=SC1091
[[ -f .test-pipeline.env ]] && source .test-pipeline.env

COVERAGE_MIN="${COVERAGE_MIN:-80}"
FLAKY_RERUNS="${FLAKY_RERUNS:-2}"
ALLOW_FLAKY="${ALLOW_FLAKY:-0}"
BASE_REF="${BASE_REF:-origin/main}"
REQUIRE_DEVICE="${REQUIRE_DEVICE:-0}"
RESULTS_DIR="${RESULTS_DIR:-test-results}"
SUMMARY="$RESULTS_DIR/pipeline-summary.md"
mkdir -p "$RESULTS_DIR"

log()  { printf '\033[1;34m[pipeline]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[pipeline] WARN:\033[0m %s\n' "$*" >&2; }
has()  { command -v "$1" >/dev/null 2>&1; }
# sx: run a command whose LAST arg is a space-separated word list (intentional splitting)
sx() { local -a w; read -ra w <<<"${*: -1}"; "${@:1:$#-1}" "${w[@]}"; }
record() { printf '| %s | %s | %s |\n' "$1" "$2" "$3" >>"$SUMMARY"; }

# ---------- stack detection ----------
STACKS=()
detect_stacks() {
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

# ---------- node helpers ----------
pm() {
  if [[ -f pnpm-lock.yaml ]]; then echo pnpm
  elif [[ -f yarn.lock ]]; then echo yarn
  else echo npm; fi
}
has_script() { node -e "process.exit(require('./package.json').scripts?.['$1'] ? 0 : 1)" 2>/dev/null; }
has_dep() {
  node -e "const p=require('./package.json');process.exit({...p.dependencies,...p.devDependencies}['$1']?0:1)" 2>/dev/null
}
run_script() { local p; p="$(pm)"; if [[ "$p" == npm ]]; then npm run --silent "$@"; else "$p" run "$@"; fi; }
e2e_runner() {
  if [[ -n "${E2E_RUNNER:-}" ]]; then echo "$E2E_RUNNER"
  elif has_dep cypress || compgen -G 'cypress.config.*' >/dev/null; then echo cypress
  elif has_dep @playwright/test || compgen -G 'playwright.config.*' >/dev/null; then echo playwright
  else echo none; fi
}
run_e2e() { # $1 = optional spec filter
  local runner; runner="$(e2e_runner)"
  case "$runner" in
    cypress)    if [[ -n "${1:-}" ]]; then npx cypress run --spec "$1"; else npx cypress run; fi ;;
    playwright) if [[ -n "${1:-}" ]]; then npx playwright test "$1"; else npx playwright test; fi ;;
    *) warn "no E2E runner (cypress/playwright) found"; return 0 ;;
  esac
}

# ---------- per-stack stages ----------
node_lint() {
  if has_script lint; then run_script lint; else npx --no-install eslint . ; fi
  if has_script typecheck; then run_script typecheck
  elif [[ -f tsconfig.json ]]; then npx --no-install tsc --noEmit; fi
}
node_unit() {
  if has_script test:unit; then run_script test:unit
  elif has_dep vitest; then npx vitest run --coverage
  elif has_dep jest; then npx jest --coverage --ci
  elif has_script test; then run_script test
  else warn "no unit test runner found for node"; fi
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
  elif [[ "$REQUIRE_DEVICE" == 1 ]]; then warn "no device/emulator and REQUIRE_DEVICE=1"; return 1
  else warn "no device/emulator: instrumented (Espresso) tests SKIPPED"; SKIPPED+=("android-functional"); fi
}
android_regression() { sx "$(gradle_cmd)" --no-daemon "${GRADLE_REGRESSION_TASKS:-check}"; }
gradle_lint()        { sx "$(gradle_cmd)" --no-daemon "${GRADLE_LINT_TASKS:-check -x test}"; }
gradle_unit()        { sx "$(gradle_cmd)" --no-daemon "${GRADLE_UNIT_TASKS:-test}"; }
gradle_functional()  { sx "$(gradle_cmd)" --no-daemon "${GRADLE_FUNCTIONAL_TASKS:-integrationTest}" || return 1; }
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
  if has cppcheck; then
    sx cppcheck --error-exitcode=1 --enable=warning,style,performance,portability --inline-suppr \
      --suppress=missingIncludeSystem -q "${C_SRC_DIRS:-src include}"
  else warn "cppcheck not installed"; fi
}
c_cmake_lint() {
  c_configure; c_static
  if has run-clang-tidy; then run-clang-tidy -p "$C_BUILD" -quiet
  elif has clang-tidy; then
    local -a dirs; read -ra dirs <<<"${C_SRC_DIRS:-src}"
    find "${dirs[@]}" -name '*.c' -print0 | xargs -0 -r clang-tidy -p "$C_BUILD" --quiet
  else warn "clang-tidy not installed"; fi
}
c_cmake_unit() {
  c_configure; cmake --build "$C_BUILD" -j"$(nproc)"
  sx ctest --test-dir "$C_BUILD" --output-on-failure "${CTEST_UNIT_ARGS:--L unit}"
}
c_cmake_functional() { cmake --build "$C_BUILD" -j"$(nproc)"; sx ctest --test-dir "$C_BUILD" --output-on-failure "${CTEST_FUNCTIONAL_ARGS:--L functional}"; }
c_cmake_regression() {
  cmake --build "$C_BUILD" -j"$(nproc)"; ctest --test-dir "$C_BUILD" --output-on-failure
  if has gcovr; then gcovr -r . "$C_BUILD" --fail-under-line "$COVERAGE_MIN" --xml "$RESULTS_DIR/coverage-c.xml"; fi
}
c_make_lint()       { c_static; }
c_make_unit()       { sx make "${MAKE_UNIT_TARGET:-test}"; }
c_make_functional() { if make -n functional >/dev/null 2>&1; then make functional; else warn "no 'functional' make target"; fi; }
c_make_regression() { sx make "${MAKE_REGRESSION_TARGET:-check}"; }

python_lint()       { if has ruff; then ruff check . && ruff format --check .; fi; if has mypy && [[ -f mypy.ini || -f pyproject.toml ]]; then mypy . || return 1; fi; }
python_unit()       { pytest -m "not functional" --cov --cov-report=xml:"$RESULTS_DIR/coverage-py.xml" -q; }
python_functional() { pytest -m functional -q || [[ $? -eq 5 ]]; } # 5 = no tests collected
python_regression() { pytest -q; }

# ---------- stage runner with flakiness detection ----------
SKIPPED=()
FLAKY=0
run_stage() { # $1 stage
  local stage="$1" override_var cmd stack
  override_var="$(tr '[:lower:]' '[:upper:]' <<<"$stage")_CMD"
  cmd="${!override_var:-}"
  attempt() {
    if [[ -n "$cmd" ]]; then bash -c "$cmd"; return; fi
    for stack in "${STACKS[@]}"; do
      log "[$stage] $stack"
      "${stack}_${stage}" || return 1
    done
  }
  log "=== stage: $stage ==="
  if attempt; then record "$stage" PASS "first run"; return 0; fi
  local i
  for ((i = 1; i <= FLAKY_RERUNS; i++)); do
    warn "[$stage] failed - rerun $i/$FLAKY_RERUNS to detect flakiness"
    if attempt; then
      record "$stage" FLAKY "passed on rerun $i (investigate!)"; FLAKY=1
      [[ "$ALLOW_FLAKY" == 1 ]] && return 0
      return 2
    fi
  done
  record "$stage" FAIL "failed $((FLAKY_RERUNS + 1))x (deterministic)"
  return 1
}

COV_MEASURED=1
changed_coverage() {
  has diff-cover || { warn "diff-cover not installed: changed-code coverage not enforced"; COV_MEASURED=0; return 0; }
  git rev-parse --verify -q "$BASE_REF" >/dev/null || { warn "base ref $BASE_REF missing"; COV_MEASURED=0; return 0; }
  local reports=()
  while IFS= read -r f; do reports+=("$f"); done < <(find . -name node_modules -prune -o \
    \( -name 'cobertura-coverage.xml' -o -name 'coverage*.xml' -o -name 'jacocoTestReport.xml' \) -print 2>/dev/null)
  [[ ${#reports[@]} -eq 0 ]] && { warn "no coverage XML report found"; COV_MEASURED=0; return 0; }
  diff-cover "${reports[@]}" --compare-branch="$BASE_REF" --fail-under="$COVERAGE_MIN" \
    --format "markdown:$RESULTS_DIR/diff-coverage.md"
}

main() {
  local stages=("$@")
  [[ ${#stages[@]} -eq 0 ]] && stages=(lint unit functional regression)
  for s in "${stages[@]}"; do
    [[ "$s" =~ ^(lint|unit|functional|regression)$ ]] || { echo "unknown stage: $s" >&2; exit 2; }
  done
  detect_stacks
  if [[ ${#STACKS[@]} -eq 0 && -z "${LINT_CMD:-}${UNIT_CMD:-}${FUNCTIONAL_CMD:-}${REGRESSION_CMD:-}" ]]; then
    echo "no supported stack detected" >&2; exit 3
  fi
  log "detected stacks: ${STACKS[*]:-custom}"
  if [[ -n "${SERVICES_DOWN_CMD:-}" ]]; then trap 'eval "$SERVICES_DOWN_CMD"' EXIT; fi
  if [[ -n "${SERVICES_UP_CMD:-}" ]]; then
    log "starting test services"
    eval "$SERVICES_UP_CMD" || { echo "could not start test services" >&2; exit 4; }
  fi
  { echo "# Test pipeline summary ($(date -Iseconds))"; echo; echo "Stacks: ${STACKS[*]:-custom}"; echo
    echo "| Stage | Result | Detail |"; echo "|---|---|---|"; } >"$SUMMARY"

  local s rc
  declare -A codes=([lint]=10 [unit]=20 [functional]=30 [regression]=40)
  for s in "${stages[@]}"; do
    rc=0; run_stage "$s" || rc=$?
    if [[ $rc -eq 2 ]]; then log "flaky test detected in $s"; exit 60; fi
    if [[ $rc -ne 0 ]]; then log "stage $s FAILED"; exit "${codes[$s]}"; fi
    if [[ "$s" == regression ]]; then
      changed_coverage || { record coverage FAIL "< ${COVERAGE_MIN}% on changed lines"; exit 50; }
      if [[ $COV_MEASURED -eq 1 ]]; then record coverage PASS ">= ${COVERAGE_MIN}% on changed lines"
      else record coverage WARN "changed-code coverage NOT measured (see warnings) - report as residual risk"; fi
    fi
  done
  [[ ${#SKIPPED[@]} -gt 0 ]] && record skipped WARN "${SKIPPED[*]}"
  [[ $FLAKY -eq 1 ]] && warn "flaky tests accepted (ALLOW_FLAKY=1) - must be reported"
  log "ALL STAGES GREEN - summary: $SUMMARY"
}

main "$@"

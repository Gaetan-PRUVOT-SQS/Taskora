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
# or a measurement that cannot be made is a failure, never a silent green. Each test stage (unit,
# functional, regression) must write at least one JUnit XML report with a test case during this run
# (exit 66 otherwise). Reports are read only from the directories this run creates outside the checkout,
# empty at the start of each stage and exported as JUNIT_DIR and COVERAGE_DIR: the script points pytest,
# ctest, gcovr, Cypress, Playwright, Vitest and Jest (jest-junit) at them; custom commands, npm scripts and
# make targets must write their JUnit XML and coverage XML there. Gradle and Android reports under build/
# written during the stage are copied there. Any other report (in the repo, committed, older) is ignored.
#
# Floors. These values are fixed here and in the workflow, settings can only make them stricter:
#   coverage on changed lines >= 80%, no flaky rerun (FLAKY_RERUNS=0), dependency-check fails at CVSS >= 7.0
#   or lower, hadolint fails at warning or stricter, flaky tests are never accepted.
#
# Settings from the environment (trusted: you, or the CI workflow):
#   BASE_REF=origin/main            base for changed-code coverage and the secret scan range
#   RESULTS_DIR=test-results        relative path inside the repo
#   SECURITY_CHECKS="secrets credentials sca sast dockerfile images workflows"   subset to run (CI splits them in jobs)
#   SAST_TOOL=semgrep               semgrep, or codeql-ci (only inside GitHub Actions, where the codeql
#                                   job of the workflow does the SAST)
#   PIPELINE_REQUIRED_STAGES        stages that must be part of this run (the CI sets it)
#   NVD_API_KEY                     used by dependency-check (Gradle projects)
#   HOST=127.0.0.1                  address test servers should bind to, 0.0.0.0 and :: are refused
#   TEST_DATABASE_URL               PostgreSQL on 127.0.0.1 or localhost for the API, functional and E2E
#                                   tests. Unset: scripts/test-db.sh starts a throwaway container,
#                                   except in CI (CI=true) where the workflow must provide it.
#   KEEP_TEST_DB=0                  1 = leave the container started by scripts/test-db.sh running
#   PIPELINE_ROOT                   checkout under test, when the script runs from a trusted copy elsewhere
#   PIPELINE_PREPARE=1              run the install scripts of the project after the settings are loaded
#                                   (CI: npm ci --ignore-scripts, then this), see prepare_project
#   PIPELINE_BASE_SETTINGS          base branch copy of .test-pipeline.env (empty file if the base has none).
#                                   When set, policy keys (thresholds, exemptions, E2E_SPEC) come only from it
#                                   and the head values are ignored. Required on pull_request events.
#
# Settings from .test-pipeline.env (the repo, so less trusted). Plain KEY=value lines, read as data and
# never executed. Unknown keys and keys given twice are refused. The environment wins over the file,
# except for exemptions, which only come from the file. On a pull request every key below comes from the
# base branch copy (PIPELINE_BASE_SETTINGS): the PR's own values, commands included, apply once merged.
#   LINT_CMD UNIT_CMD FUNCTIONAL_CMD REGRESSION_CMD  custom command for a stage (replaces detection).
#                                   Run with bash -c. Empty, no-op or failure-masking commands are refused.
#   E2E_RUNNER=cypress|playwright   force the E2E runner (default: cypress if present)
#   CYPRESS_BROWSER=chrome          browser for cypress run (Electron is deprecated in Cypress 16)
#   E2E_SPEC=<glob>                 restrict the functional stage to the feature's specs
#   COVERAGE_MIN=80                 can only be raised
#   FLAKY_RERUNS=0                  no rerun: a failing stage fails the run at once, any other value is refused
#   REQUIRE_DEVICE=0                1 = Android instrumented tests are mandatory, no exemption possible
#   HADOLINT_THRESHOLD=warning      warning, info or style
#   DC_FAIL_CVSS=7.0                can only be lowered
#   DC_SUPPRESSION                  dependency-check suppression file, every entry with a <notes> reason
#   SEMGREP_EXTRA_CONFIG            extra Semgrep rules, on top of p/default
#   SECRETS_FULL_HISTORY=0          1 = scan the whole git history instead of BASE_REF..HEAD
#   C_BUILD C_SRC_DIRS CTEST_UNIT_ARGS CTEST_FUNCTIONAL_ARGS MAKE_UNIT_TARGET MAKE_REGRESSION_TARGET
#   GRADLE_LINT_TASKS GRADLE_UNIT_TASKS GRADLE_FUNCTIONAL_TASKS GRADLE_REGRESSION_TASKS
#   PIPELINE_CHANGE_DECISION        read by scripts/pipeline-guard.py only (structural change of the gate or guard)
#   PIPELINE_TRUSTED_PATHS          read by scripts/pipeline-guard.py only: more paths whose change is structural
#
# Exemptions. The team cannot grant itself one. The only way past the coverage gate or the functional
# gate (no E2E runner, no device, no functional test) is a written decision from Gaetan PRUVOT, referenced
# with its date and where it was given, plus a reason of at least 20 characters and an expiry date at
# most 30 days after both today and the decision. All three are printed in the summary. After the expiry
# date every run fails, --check-config included, until the gap is fixed or Gaetan decides again.
#   COVERAGE_EXEMPT_REASON="..."  COVERAGE_EXEMPT_UNTIL=YYYY-MM-DD  COVERAGE_EXEMPT_DECISION="YYYY-MM-DD <where>"
#   E2E_EXEMPT_REASON="..."       E2E_EXEMPT_UNTIL=YYYY-MM-DD       E2E_EXEMPT_DECISION="YYYY-MM-DD <where>"
# <where> is a comment or review of Gaetan on this repository:
#   https://github.com/Gaetan-PRUVOT-SQS/Taskora/(issues|pull)/<n>#issuecomment-<id>  (or #pullrequestreview-<id>)
# Exemptions are read from .test-pipeline.env only, an exemption variable in the environment is refused.
# A file of the repo cannot hold the decision: a PR could add it together with the exemption.
# Skipped, pending, focused (.only) or quarantined tests always fail the run (exit 65), there is no exemption.
# Each test stage must run at least one test: the runners write JUnit XML into JUNIT_DIR and coverage XML
# into COVERAGE_DIR, two empty directories this script creates for each stage outside the checkout, and
# a stage without a test case reported there fails (exit 80). Nothing else is read: a report in the repo,
# committed or left by an earlier step never counts (V-04).
# Security findings are never waived by a variable. Known false positives go in the tools' own files,
# reviewed with the code: .gitleaksignore, osv-scanner.toml, nosemgrep or nosem comments, hadolint ignores, DC_SUPPRESSION.
#
# Exit codes: 0 OK | 2 usage or refused setting | 3 no stack | 4 test database | 5 install step (PIPELINE_PREPARE) | 10 lint | 20 unit | 30 functional
#             | 40 regression | 50 coverage | 60 flaky test | 65 skipped, focused or quarantined test
#             | 70 security | 80 incomplete run
# F-11: bash reads a script as it runs it. Here, everything above the last line only defines functions or
# reads the settings, before any code of the project runs, and main, called on the last line, always exits:
# bash reads nothing more, so project code that rewrites this file during the stages changes nothing in the run.
# shellcheck disable=SC2317  # main exits instead of returning (above), shellcheck then takes every function for unreachable
set -euo pipefail

# SELF_DIR: where this script and its helpers live. In CI it is a copy taken before any code of the project
# runs, checked against its SHA-256 just before use (F-11), outside the checkout.
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# PIPELINE_ROOT: the checkout under test, when the script is not run from its own scripts/ directory.
if [[ -n "${PIPELINE_ROOT:-}" ]]; then
  [[ "$PIPELINE_ROOT" == /* && -d "$PIPELINE_ROOT" ]] || { echo "PIPELINE_ROOT must be an absolute directory" >&2; exit 2; }
  ROOT="$(cd "$PIPELINE_ROOT" && pwd)"
else
  ROOT="$(cd "$SELF_DIR/.." && pwd)"
fi
cd "$ROOT"
# helpers of the script, fingerprinted now (before any project code runs) and checked again before each use
declare -A HELPER_SHA=()
for _h in pipeline-settings.py security/dependency-check.init.gradle security/check-db-credentials.py test-db.sh; do
  [[ -f "$SELF_DIR/$_h" && ! -L "$SELF_DIR/$_h" ]] || { echo "missing helper $SELF_DIR/$_h" >&2; exit 2; }
  HELPER_SHA[$_h]="$(sha256sum <"$SELF_DIR/$_h")"
done
unset _h
# helper NAME: path of a helper, after checking it is still the file fingerprinted at startup
helper() {
  [[ -f "$SELF_DIR/$1" && ! -L "$SELF_DIR/$1" && "$(sha256sum <"$SELF_DIR/$1")" == "${HELPER_SHA[$1]}" ]] \
    || die 2 "helper $1 changed during the run, refused"
  printf '%s' "$SELF_DIR/$1"
}

# ---------- floors (keep in sync with the workflow, which checks them) ----------
readonly COVERAGE_FLOOR=80
readonly FLAKY_RERUNS_FLOOR=0
readonly FLAKY_RERUNS_MAX=0
readonly DC_CVSS_CEILING=7.0
readonly MIN_REASON_LEN=20
readonly EXEMPT_MAX_DAYS=30
readonly DECISION_OWNER="Gaetan-PRUVOT-SQS"
readonly DECISION_NAME="Gaetan PRUVOT"
readonly DECISION_REPO="Taskora"
readonly NODE_MAJOR_MIN=22
readonly ALL_STAGES="security lint unit functional regression"
readonly ALL_SECURITY_CHECKS="secrets credentials sca sast dockerfile images workflows"

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
COVERAGE_EXEMPT_REASON COVERAGE_EXEMPT_UNTIL COVERAGE_EXEMPT_DECISION E2E_EXEMPT_REASON E2E_EXEMPT_UNTIL
E2E_EXEMPT_DECISION PIPELINE_CHANGE_DECISION
PIPELINE_TRUSTED_PATHS"
FILE_KEYS="${FILE_KEYS//$'\n'/ }"
FILE_SET=()
IGNORED_FROM_HEAD=()
BASE_SET=()
BASE_UNKNOWN=()
# Policy keys: thresholds, exemptions and anything that narrows what a stage checks. On a pull request
# they come from the base branch copy of .test-pipeline.env (PIPELINE_BASE_SETTINGS), never from the
# head, so a PR cannot lower its own bar. The PR's own values only apply once it is merged.
# Taskora: every key of the file is a policy key, the stage commands included (a PR replacing UNIT_CMD
# with a no-op would otherwise run no test).
POLICY_KEYS="$FILE_KEYS"
EXEMPT_KEYS="COVERAGE_EXEMPT_REASON COVERAGE_EXEMPT_UNTIL COVERAGE_EXEMPT_DECISION E2E_EXEMPT_REASON E2E_EXEMPT_UNTIL E2E_EXEMPT_DECISION"
# parse_settings FILE WHICH LABEL: WHICH is all, policy (policy keys only) or head (policy keys ignored)
parse_settings() {
  local f="$1" which="$2" label="$3" key val pairs
  # one reader for the script and the guard (F-13): scripts/pipeline-settings.py, NUL separated output.
  # It refuses what two readers could split differently: control or separator characters, BOM, keys set twice.
  pairs="$(mktemp)"
  if ! python3 "$(helper pipeline-settings.py)" --nul "$f" >"$pairs" 2>"$pairs.err"; then
    local why; why="$(cat "$pairs.err")"; rm -f "$pairs" "$pairs.err"
    die 2 "$label refused: ${why#"$f"}"
  fi
  rm -f "$pairs.err"
  while IFS= read -r -d '' key && IFS= read -r -d '' val; do
    if ! in_list "$key" "$FILE_KEYS"; then
      # the base branch is already merged: a key this version no longer knows (older format) is dropped,
      # which can only remove a base setting, never add one. The head file stays strict.
      if [[ "$which" == policy ]]; then BASE_UNKNOWN+=("$key"); continue; fi
      die 2 "$label: $key cannot be set from the repo (unknown or environment-only)"
    fi
    if in_list "$key" "$POLICY_KEYS"; then
      [[ "$which" == head ]] && { IGNORED_FROM_HEAD+=("$key"); continue; }
    else
      [[ "$which" == policy ]] && continue
    fi
    if [[ -z "${!key+set}" ]]; then
      printf -v "$key" '%s' "$val"; export "${key?}"; FILE_SET+=("$key")
      if [[ "$which" == policy ]]; then BASE_SET+=("$key"); fi
    fi
  done <"$pairs"
  rm -f "$pairs"
}
load_settings() {
  local f=.test-pipeline.env k
  # exemptions come from the settings file only (base copy on a PR), never from the environment,
  # where any earlier CI step could write them through GITHUB_ENV
  for k in $EXEMPT_KEYS; do
    [[ -z "${!k+set}" ]] || die 2 "$k is set in the environment: an exemption can only come from .test-pipeline.env"
  done
  if [[ "${GITHUB_EVENT_NAME:-}" == pull_request* && -z "${PIPELINE_BASE_SETTINGS+set}" ]]; then
    die 2 "pull request run without PIPELINE_BASE_SETTINGS: thresholds must come from the base branch"
  fi
  if [[ -n "${PIPELINE_BASE_SETTINGS+set}" ]]; then
    # the workflow writes an empty file when the base branch has none, so a missing file is an error
    [[ -f "$PIPELINE_BASE_SETTINGS" && ! -L "$PIPELINE_BASE_SETTINGS" ]] \
      || die 2 "PIPELINE_BASE_SETTINGS=$PIPELINE_BASE_SETTINGS is not a regular file"
    local real
    real="$(realpath "$PIPELINE_BASE_SETTINGS")"
    [[ "$real" != "$ROOT"/* ]] || die 2 "PIPELINE_BASE_SETTINGS=$PIPELINE_BASE_SETTINGS is inside the tested worktree, it must be the base branch copy"
    # on a pull request no repo setting may come from the environment either
    for k in $FILE_KEYS; do
      [[ -z "${!k+set}" ]] || die 2 "$k is set in the environment on a pull request run, it must come from the base branch"
    done
    parse_settings "$PIPELINE_BASE_SETTINGS" policy "base .test-pipeline.env"
    [[ -f "$f" ]] && parse_settings "$f" head "$f"
    if [[ ${#BASE_UNKNOWN[@]} -gt 0 ]]; then
      warn "unknown keys in the base .test-pipeline.env, ignored: ${BASE_UNKNOWN[*]}"
    fi
    if [[ ${#IGNORED_FROM_HEAD[@]} -gt 0 ]]; then
      warn "ignored from the head .test-pipeline.env, the base branch value applies: ${IGNORED_FROM_HEAD[*]}"
    fi
  elif [[ -f "$f" ]]; then
    parse_settings "$f" all "$f"
  fi
  return 0
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
  # a base branch written before the no-rerun rule may still say FLAKY_RERUNS=2: no rerun anyway
  if [[ "$FLAKY_RERUNS" != "$FLAKY_RERUNS_MAX" ]] && in_list FLAKY_RERUNS "${BASE_SET[*]:-}"; then
    warn "FLAKY_RERUNS=$FLAKY_RERUNS in the base .test-pipeline.env, ignored: no rerun is allowed"
    FLAKY_RERUNS="$FLAKY_RERUNS_MAX"
  fi
  if ! [[ "$FLAKY_RERUNS" =~ ^[0-9]$ ]] || (( FLAKY_RERUNS < FLAKY_RERUNS_FLOOR || FLAKY_RERUNS > FLAKY_RERUNS_MAX )); then
    die 2 "FLAKY_RERUNS=$FLAKY_RERUNS refused: no rerun is allowed, it must be $FLAKY_RERUNS_MAX"
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
  # V-17: HEAD (or FETCH_HEAD, ORIG_HEAD...) as the base leaves no changed line to measure
  [[ ! "$BASE_REF" =~ (^|/)[A-Z_]*HEAD$ ]] || die 2 "BASE_REF=$BASE_REF refused: the base must be the branch the change goes into, not HEAD"
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
    die 2 "TEST_DATABASE_URL refused: expected a postgresql:// URL with credentials, on 127.0.0.1 or localhost"
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
  for k in COVERAGE_EXEMPT E2E_EXEMPT; do check_exemption "$k"; done
  return 0
}

# check_exemption COVERAGE_EXEMPT: a reason needs a written decision from Gaetan (date and place) and a
# valid expiry date, today or later and at most EXEMPT_MAX_DAYS after today and after the decision.
# Dates are compared in UTC. A date or a decision without a reason is refused too.
valid_date() { [[ "$1" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ && "$(date -u -d "$1" +%F 2>/dev/null)" == "$1" ]]; }
check_exemption() {
  local reason until decision today max ddate where dmax
  reason="$(trim "$(var_value "$1_REASON")")"
  until="$(trim "$(var_value "$1_UNTIL")")"
  decision="$(trim "$(var_value "$1_DECISION")")"
  if [[ -z "$reason" ]]; then
    [[ -z "$until" ]] || die 2 "$1_UNTIL is set without $1_REASON"
    [[ -z "$decision" ]] || die 2 "$1_DECISION is set without $1_REASON"
    return 0
  fi
  [[ ${#reason} -ge $MIN_REASON_LEN ]] \
    || die 2 "$1_REASON is set but too short (${#reason} chars, need $MIN_REASON_LEN). Write why the gate cannot apply."
  [[ -n "$decision" ]] || die 2 "$1_REASON needs $1_DECISION=\"YYYY-MM-DD <where>\", a written decision from $DECISION_NAME. The team cannot grant itself an exemption."
  [[ "$decision" =~ ^([0-9]{4}-[0-9]{2}-[0-9]{2})[[:space:]]+([^[:space:]]+)$ ]] \
    || die 2 "$1_DECISION=$decision refused: expected \"YYYY-MM-DD <where>\""
  ddate="${BASH_REMATCH[1]}"; where="${BASH_REMATCH[2]}"
  valid_date "$ddate" || die 2 "$1_DECISION date $ddate is not a valid YYYY-MM-DD date"
  [[ "$where" =~ ^https://github\.com/([A-Za-z0-9-]+)/([A-Za-z0-9._-]+)/(issues|pull)/[0-9]+\#(issuecomment|pullrequestreview)-[0-9]+$ ]] \
    || die 2 "$1_DECISION refused: <where> must be a link to a comment or review of $DECISION_NAME on $DECISION_OWNER/$DECISION_REPO"
  [[ "${BASH_REMATCH[1]}/${BASH_REMATCH[2]}" == "$DECISION_OWNER/$DECISION_REPO" ]] \
    || die 2 "$1_DECISION refused: the decision must be given on $DECISION_OWNER/$DECISION_REPO, not ${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
  [[ -n "$until" ]] || die 2 "$1_REASON needs $1_UNTIL=YYYY-MM-DD, at most $EXEMPT_MAX_DAYS days ahead"
  valid_date "$until" || die 2 "$1_UNTIL=$until is not a valid YYYY-MM-DD date"
  today="$(date -u +%F)"
  [[ ! "$ddate" > "$today" ]] || die 2 "$1_DECISION is dated $ddate, in the future"
  max="$(date -u -d "$today + $EXEMPT_MAX_DAYS days" +%F)"
  dmax="$(date -u -d "$ddate + $EXEMPT_MAX_DAYS days" +%F)"
  [[ ! "$until" < "$today" ]] \
    || die 2 "$1 expired on $until. Close the gap, or ask $DECISION_NAME for a new written decision."
  [[ ! "$until" > "$max" ]] || die 2 "$1_UNTIL=$until is too far ahead, the latest accepted date is $max"
  [[ ! "$until" > "$dmax" ]] || die 2 "$1_UNTIL=$until is more than $EXEMPT_MAX_DAYS days after the decision of $ddate (latest $dmax)"
}
var_value() { printf '%s' "${!1:-}"; }

load_settings
validate_settings
SUMMARY="$RESULTS_DIR/pipeline-summary.md"
mkdir -p "$RESULTS_DIR"
touch -d "@$(( $(date +%s) - 1 ))" "$RESULTS_DIR/.run.start"

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
  # length and expiry were checked at startup by check_exemption
  local until_var="${name%_REASON}_UNTIL" dec_var="${name%_REASON}_DECISION"
  EXEMPT_USED[$name]="$val (decision ${!dec_var}, expires ${!until_var})"
  return 0
}

finish() {
  local rc=$?
  save_reports
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
# The API, functional and E2E tests run on a real PostgreSQL. The CI starts it with scripts/test-db.sh
# and a random password of its own, then gives TEST_DATABASE_URL; locally scripts/test-db.sh starts a
# throwaway one bound to 127.0.0.1 with a random password. The password is never logged.
STARTED_TEST_DB=0
test_db_up() {
  if [[ -n "${TEST_DATABASE_URL:-}" ]]; then log "test database: given by TEST_DATABASE_URL"; return 0; fi
  # in CI the workflow provides the database, a missing URL means the workflow is wrong
  [[ "${CI:-}" != true ]] || die 4 "TEST_DATABASE_URL must come from the CI workflow (test database step)"
  local url db
  db="$(helper test-db.sh)"
  url="$(bash "$db" start)" || die 4 "could not start the test database (is Docker running?)"
  STARTED_TEST_DB=1
  export TEST_DATABASE_URL="$url"
  log "test database: ${url%%:*}://taskora:***@${url##*@}"
}
# no stage runs without a reachable Postgres whose role can create the per-test databases
test_db_check() {
  [[ -f test/scripts/check-test-db.mjs ]] || return 0
  node test/scripts/check-test-db.mjs || die 4 "the test database is not usable, see above"
}
test_db_down() {
  if [[ ${STARTED_TEST_DB:-0} -eq 1 && "${KEEP_TEST_DB:-0}" != 1 ]]; then bash "$(helper test-db.sh)" stop || warn "could not stop the test database"; fi
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
      local -a junit=(--reporter junit --reporter-options "mochaFile=$JUNIT_DIR/junit-cypress-[hash].xml")
      if [[ -n "${1:-}" ]]; then npx --no-install cypress run --browser "$CYPRESS_BROWSER" "${junit[@]}" --spec "$1"
      else npx --no-install cypress run --browser "$CYPRESS_BROWSER" "${junit[@]}"; fi ;;
    playwright)
      export PLAYWRIGHT_JUNIT_OUTPUT_NAME="$JUNIT_DIR/junit-playwright.xml"
      if [[ -n "${1:-}" ]]; then npx --no-install playwright test --reporter=list,junit "$1"
      else npx --no-install playwright test --reporter=list,junit; fi ;;
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
  elif has_dep vitest; then
    npx --no-install vitest run --coverage --coverage.reporter=cobertura --coverage.reportsDirectory="$COVERAGE_DIR/vitest" \
      --reporter=default --reporter=junit --outputFile.junit="$JUNIT_DIR/junit-vitest.xml"
  elif has_dep jest; then
    JEST_JUNIT_OUTPUT_DIR="$JUNIT_DIR" npx --no-install jest --ci --coverage --coverageReporters=cobertura --coverageDirectory="$COVERAGE_DIR/jest"
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
  sx ctest --test-dir "$C_BUILD" --output-on-failure --no-tests=error --output-junit "$JUNIT_DIR/junit-ctest-unit.xml" \
    "${CTEST_UNIT_ARGS:--L unit}"
}
c_cmake_functional() {
  cmake --build "$C_BUILD" -j"$(nproc)" || return 1
  local rc=0
  sx ctest --test-dir "$C_BUILD" --output-on-failure --no-tests=error --output-junit "$JUNIT_DIR/junit-ctest-functional.xml" \
    "${CTEST_FUNCTIONAL_ARGS:--L functional}" || rc=$?
  if [[ $rc -ne 0 ]] && ! sx ctest --test-dir "$C_BUILD" -N "${CTEST_FUNCTIONAL_ARGS:--L functional}" | grep -q 'Test *#'; then
    functional_missing "no functional ctest found"; return
  fi
  return "$rc"
}
c_cmake_regression() {
  cmake --build "$C_BUILD" -j"$(nproc)" || return 1
  ctest --test-dir "$C_BUILD" --output-on-failure --no-tests=error --output-junit "$JUNIT_DIR/junit-ctest-regression.xml" || return 1
  # gcovr writes coverage-c.xml in COVERAGE_DIR, which the changed-code coverage gate then reads
  has gcovr || { gate_fail "gcovr is not installed, C coverage cannot be measured"; return 1; }
  gcovr -r . "$C_BUILD" --fail-under-line "$COVERAGE_MIN" --xml "$COVERAGE_DIR/coverage-c.xml"
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
python_unit()       { pytest -m "not functional" --cov --cov-report=xml:"$COVERAGE_DIR/coverage-py.xml" --junitxml="$JUNIT_DIR/junit-py-unit.xml" -q; }
python_functional() {
  local rc=0; pytest -m functional --junitxml="$JUNIT_DIR/junit-py-functional.xml" -q || rc=$?
  if [[ $rc -eq 5 ]]; then functional_missing "no functional pytest collected"; return; fi
  return "$rc"
}
python_regression() { pytest --junitxml="$JUNIT_DIR/junit-py-regression.xml" -q; }

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
       "$(gradle_cmd)" --no-daemon --init-script "$(helper security/dependency-check.init.gradle)" dependencyCheckAggregate; then
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

# Taskora: no default or trivial database password and no published Postgres port (GH-01)
sec_credentials() {
  need credentials python3 || return 0
  if python3 "$(helper security/check-db-credentials.py)" . >"$RESULTS_DIR/db-credentials.txt" 2>&1; then
    sec_ok credentials "$(tail -n 1 "$RESULTS_DIR/db-credentials.txt")"
  else
    cat "$RESULTS_DIR/db-credentials.txt" >&2
    sec_fail credentials "database password or published Postgres port, see $RESULTS_DIR/db-credentials.txt"
  fi
}

# Images built from every Dockerfile and scanned by Trivy: HIGH and CRITICAL vulnerabilities, secrets in
# the layers, and misconfigurations of any severity in the Dockerfiles (compose: see sec_credentials).
sec_images() {
  local -a files=()
  while IFS= read -r -d '' f; do files+=("$f"); done < <(find . \( -name node_modules -o -name .git -o -name .tools \) -prune -o \
    -type f \( -name Dockerfile -o -name 'Dockerfile.*' -o -name '*.Dockerfile' -o -name Containerfile \) -print0)
  if [[ ${#files[@]} -eq 0 ]]; then record security/images N/A "no Dockerfile"; return 0; fi
  need images docker trivy || return 0
  local rc=0 f dir tag n=0
  if ! trivy config --quiet --exit-code 1 --format table --output "$RESULTS_DIR/trivy-config.txt" .; then
    rc=1; cat "$RESULTS_DIR/trivy-config.txt" >&2; err "trivy config: misconfigurations, see $RESULTS_DIR/trivy-config.txt"
  fi
  for f in "${files[@]}"; do
    dir="$(dirname "$f")"; n=$((n + 1))
    tag="pipeline-scan-$(basename "$(cd "$dir" && pwd)" | tr -c 'a-z0-9\n' '-'):$n"
    # Taskora: the repo root is the build context of every image, so it installs from the root lockfile,
    # the one the tests ran on (RSK-05); <Dockerfile>.dockerignore next to each Dockerfile limits it
    if ! DOCKER_BUILDKIT=1 docker build --quiet --file "$f" --tag "$tag" . >/dev/null; then
      rc=1; err "docker build failed for $f"; continue
    fi
    if ! trivy image --quiet --scanners vuln,secret --severity HIGH,CRITICAL --exit-code 1 \
         --format json --output "$RESULTS_DIR/trivy-image-$n.json" "$tag"; then
      rc=1; trivy convert --format table "$RESULTS_DIR/trivy-image-$n.json" >&2 || true
      err "trivy image: HIGH or CRITICAL findings in the image of $f, see $RESULTS_DIR/trivy-image-$n.json"
    fi
    docker image rm --force "$tag" >/dev/null 2>&1 || true
  done
  if [[ $rc -eq 0 ]]; then sec_ok images "trivy clean on ${#files[@]} image(s): no HIGH or CRITICAL, no secret, no misconfiguration"
  else sec_fail images "trivy findings or build failure, reports in $RESULTS_DIR/trivy-*"; fi
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

# ---------- install steps of the project, after the pipeline state is loaded (F-11) ----------
# In CI the dependencies are installed without their lifecycle scripts (npm ci --ignore-scripts) and the
# Python project is not built, so no code of the PR runs before this script has read its settings, its
# decisions and its helpers (all kept in memory). The workflow sets PIPELINE_PREPARE=1 and the install steps
# run here: dependency and project lifecycle scripts, browser downloads of the E2E runners, the editable
# Python install. Locally (PIPELINE_PREPARE unset) your own installation is used as it is.
prepare_project() {
  [[ "${PIPELINE_PREPARE:-0}" == 1 ]] || return 0
  if has_stack node; then
    [[ "$(pm)" == npm ]] || { gate_fail "PIPELINE_PREPARE=1 supports npm projects only"; return 1; }
    log "[prepare] npm rebuild, then the install scripts of the project"
    npm rebuild --foreground-scripts || return 1
    local h
    for h in preinstall install postinstall prepare; do npm run --if-present "$h" || return 1; done
    if has_dep cypress; then { npx --no-install cypress install && npx --no-install cypress verify; } || return 1; fi
    if has_dep @playwright/test; then npx --no-install playwright install --with-deps || return 1; fi
    # Taskora: the Playwright DnD check lives in the e2e workspace and only needs Chromium
    if [[ -f test/e2e/package.json ]] && grep -q '"@playwright/test"' test/e2e/package.json; then
      npx --no-install --workspace=e2e playwright install --with-deps chromium || return 1
    fi
  fi
  if has_stack python && [[ -f pyproject.toml || -f setup.py ]]; then
    log "[prepare] editable install of the Python project, without dependencies"
    python -m pip install --no-deps -e . || return 1
  fi
  record prepare PASS "install steps run after the pipeline state was loaded"
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
  record "$stage" FAIL "failed (FLAKY_RERUNS=$FLAKY_RERUNS, no rerun)"
  STAGE_RESULT[$stage]=FAIL
  return 1
}

# ---------- zero skipped, pending, focused or quarantined test ----------
# Two checks, both fail-closed and without exemption:
#  1. markers in the test sources tracked by git, per stack (JS/TS, Kotlin/Java, Python, C/C++ test frameworks);
#  2. JUnit XML reports written during this stage (Gradle, Android, pytest --junitxml, ctest --output-junit,
#     jest-junit...) that report a skipped test.
SKIP_RE_JS='(^|[^A-Za-z0-9_$.])((it|test|describe|context|suite|specify)\.(skip|only|todo|failing)|x(it|test|describe|context|specify)|f(it|describe)|pending)[[:space:]]*\('
SKIP_RE_JVM='@(Ignore|Disabled|DisabledIf[A-Za-z]*|Flaky|FlakyTest|Quarantine[A-Za-z]*)\b|assume(True|False|That)[[:space:]]*\(|Assumptions\.'
SKIP_RE_PY='pytest\.mark\.(skip|skipif|xfail)|pytest\.(skip|xfail|importorskip)[[:space:]]*\(|unittest\.skip|@skip(If|Unless)?\b|\.skipTest[[:space:]]*\('
SKIP_RE_C='\bDISABLED_|GTEST_SKIP|TEST_IGNORE|UNITY_IGNORE|\bskip\(\)|cmocka_skip|set_tests_properties\(.*DISABLED'
SKIP_RE_ANY='[Qq]uarantin'
skip_markers() {
  local f re hits=()
  while IFS= read -r -d '' f; do
    case "$f" in
      *.js|*.jsx|*.ts|*.tsx|*.mjs|*.cjs) re="$SKIP_RE_JS" ;;
      *.kt|*.kts|*.java) re="$SKIP_RE_JVM" ;;
      *.py) re="$SKIP_RE_PY" ;;
      *.c|*.cc|*.cpp|*.h|*.hpp|CMakeLists.txt|*.cmake) re="$SKIP_RE_C" ;;
      *) continue ;;
    esac
    if grep -nE -- "$re|$SKIP_RE_ANY" "$f" >>"$RESULTS_DIR/skipped-markers.txt" 2>/dev/null; then hits+=("$f"); fi
  done < <(git ls-files -z --cached --others --exclude-standard -- \
      ':(glob)**/test/**' ':(glob)**/tests/**' ':(glob)**/Tests/**' ':(glob)**/__tests__/**' ':(glob)**/spec/**' \
      ':(glob)**/e2e/**' ':(glob)**/cypress/**' ':(glob)**/src/test/**' ':(glob)**/src/androidTest/**' \
      ':(glob)**/*.test.*' ':(glob)**/*.spec.*' ':(glob)**/*.cy.*' ':(glob)**/test_*.py' ':(glob)**/*_test.py' \
      ':(glob)**/*_test.c' ':(glob)**/*_test.cc' ':(glob)**/*_test.cpp' 2>/dev/null)
  [[ ${#hits[@]} -eq 0 ]] && return 0
  err "skipped, focused or quarantined test markers in: ${hits[*]} (see $RESULTS_DIR/skipped-markers.txt)"
  return 1
}
# ---------- reports: only what this run wrote in its own directories (V-04, V-13) ----------
# REPORTS_ROOT is created by this run, outside the checkout. Each test stage gets an empty JUNIT_DIR and
# COVERAGE_DIR in it, exported: the script hands them to the runners it starts (Vitest, Jest, Cypress,
# Playwright, pytest, ctest, gcovr), custom commands and npm scripts must write their JUnit XML and coverage
# XML there. Nothing else is read: a report in the repo, committed, left by an earlier step or written before
# the stage never counts. Gradle and Android write under build/, see collect_build_reports.
REPORTS_ROOT=""
new_reports_root() {
  local base="${RUNNER_TEMP:-${TMPDIR:-/tmp}}" real
  REPORTS_ROOT="$(mktemp -d "$base/pipeline-reports.XXXXXX")" || die 2 "cannot create the report directory in $base"
  real="$(realpath "$REPORTS_ROOT")"
  [[ "$real/" != "$(realpath "$ROOT")"/* ]] || die 2 "the report directory $REPORTS_ROOT is inside the checkout, set TMPDIR outside it"
}
stage_dirs() { # stage_dirs STAGE
  JUNIT_DIR="$REPORTS_ROOT/$1/junit"; COVERAGE_DIR="$REPORTS_ROOT/$1/coverage"
  mkdir -p "$JUNIT_DIR" "$COVERAGE_DIR"
  export JUNIT_DIR COVERAGE_DIR
}
# Gradle and Android: reports under build/ written after the exact start of the stage (no margin) and not
# tracked by git are copied into the stage directories. Where they are written is decided by the build files.
collect_build_reports() { # collect_build_reports MARK
  local f dest
  while IFS= read -r -d '' f; do
    git ls-files --error-unmatch -- "$f" >/dev/null 2>&1 && continue
    dest="$(printf '%s' "${f#./}" | tr '/' '_')"
    case "$f" in
      */jacoco*.xml) cp "$f" "$COVERAGE_DIR/$dest" ;;
      */test-results/*|*/androidTest-results/*) cp "$f" "$JUNIT_DIR/$dest" ;;
    esac
  done < <(find . \( -name node_modules -o -name .git \) -prune -o -type f -path '*/build/*' -name '*.xml' -newer "$1" -print0 2>/dev/null)
}
junit_reports() { find "$JUNIT_DIR" -type f -name '*.xml' -print0 2>/dev/null; }
# keep a copy of what was read with the run artifacts
save_reports() { [[ -n "$REPORTS_ROOT" && -d "$REPORTS_ROOT" ]] && mkdir -p "$RESULTS_DIR/reports" && cp -R "$REPORTS_ROOT/." "$RESULTS_DIR/reports/" 2>/dev/null; return 0; }
skipped_in_reports() {
  local f bad=()
  while IFS= read -r -d '' f; do
    grep -q '<testsuite' "$f" 2>/dev/null || continue
    if grep -qE '<skipped|skipped="[1-9]|disabled="[1-9]' "$f"; then bad+=("$f"); fi
  done < <(junit_reports)
  [[ ${#bad[@]} -eq 0 ]] && return 0
  err "skipped tests reported in: ${bad[*]}"
  return 1
}
check_no_skipped() { # $1 stage
  : >"$RESULTS_DIR/skipped-markers.txt"
  local ok=1
  skip_markers || ok=0
  skipped_in_reports || ok=0
  if [[ $ok -eq 1 ]]; then record "no-skip/$1" PASS "no skipped, focused or quarantined test"; return 0; fi
  record "no-skip/$1" FAIL "skipped, focused or quarantined test found, no exemption possible"
  return 1
}

# ---------- at least one test executed ----------
# A test stage that reports no test case is a failure: a no-op command, an empty glob or a runner that
# found nothing would otherwise pass. Only JUnit XML in the JUNIT_DIR of the stage counts (created empty
# by this script for the stage, outside the checkout).
tests_ran() { # $1 stage
  local total=0 n f
  local -a files=()
  while IFS= read -r -d '' f; do
    grep -q '<testsuite' "$f" 2>/dev/null || continue
    files+=("$f")
  done < <(junit_reports)
  for f in "${files[@]}"; do
    n="$(grep -o '<testcase[[:space:]>/]' "$f" | wc -l)"; total=$((total + n))
  done
  if [[ $total -gt 0 ]]; then
    record "tests/$1" PASS "$total test case(s) executed, ${#files[@]} JUnit report(s)"
    log "[$1] $total test case(s) executed"
    return 0
  fi
  record "tests/$1" FAIL "no test executed: no JUnit test case in the JUNIT_DIR of the stage"
  err "[$1] no test executed (no JUnit test case in JUNIT_DIR=$JUNIT_DIR, see the header)"
  return 1
}

# Changed-code coverage. Not being able to measure it is a failure, unless COVERAGE_EXEMPT_REASON says why.
# The diff is made here, as text and with fixed prefixes, then given to diff-cover: .gitattributes (-diff,
# binary, a diff driver or textconv) and the git config cannot hide a changed line (V-04). BASE_REF must be
# behind HEAD on a pull request or a local run, otherwise there would be nothing to measure (V-17).
changed_coverage() {
  local why="" reports=() f base mb diff="$REPORTS_ROOT/changed-lines.diff"
  if ! has diff-cover; then why="diff-cover is not installed"
  elif ! base="$(git rev-parse --verify -q "$BASE_REF^{commit}")"; then why="base ref $BASE_REF not found"
  else
    mb="$(git merge-base "$base" HEAD)" || mb=""
    if [[ -z "$mb" ]]; then why="$BASE_REF has no common history with HEAD"
    elif [[ "$mb" == "$(git rev-parse HEAD)" && "${GITHUB_EVENT_NAME:-}" != push ]]; then
      record coverage FAIL "BASE_REF=$BASE_REF is HEAD or ahead of it: nothing would be measured"
      err "BASE_REF=$BASE_REF is HEAD or ahead of it, set it to the branch the change goes into"
      return 1
    fi
    # only the coverage directories of this run's stages
    while IFS= read -r -d '' f; do reports+=("$f"); done < <(find "$REPORTS_ROOT" -mindepth 3 -path "$REPORTS_ROOT/*/coverage/*" -type f -name '*.xml' -print0 2>/dev/null)
    [[ ${#reports[@]} -gt 0 ]] || why="no coverage XML report written by this run in COVERAGE_DIR"
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
  if ! git -c core.attributesFile=/dev/null -c diff.external= -c diff.noprefix=false diff --no-color --no-ext-diff \
       --no-textconv --text --no-renames --src-prefix=a/ --dst-prefix=b/ "$mb" -- >"$diff"; then
    record coverage FAIL "could not compute the changed lines against $BASE_REF"; return 1
  fi
  if diff-cover "${reports[@]}" --diff-file="$diff" --fail-under="$COVERAGE_MIN" \
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
    [[ -n "${PIPELINE_BASE_SETTINGS+set}" ]] && log "policy keys read from the base branch: $PIPELINE_BASE_SETTINGS"
    log "floors: COVERAGE_FLOOR=$COVERAGE_FLOOR FLAKY_RERUNS_FLOOR=$FLAKY_RERUNS_FLOOR DC_CVSS_CEILING=$DC_CVSS_CEILING"
    local k
    for k in COVERAGE_EXEMPT E2E_EXEMPT; do
      local r="${k}_REASON" u="${k}_UNTIL"
      local d="${k}_DECISION"
      [[ -n "$(trim "${!r:-}")" ]] && log "exemption $r until ${!u}, decision ${!d}: ${!r}"
    done
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
  { echo "# Test pipeline summary ($(date -Iseconds))"; echo; echo "Stacks: ${STACKS[*]:-custom}"
    [[ -n "$node_info" ]] && echo "$node_info"
    echo
    echo "| Stage | Result | Detail |"; echo "|---|---|---|"; } >"$SUMMARY"
  SUMMARY_READY=1
  new_reports_root
  # install scripts first: test/scripts/check-test-db.mjs needs the test/node_modules link of postinstall
  if [[ $only_security -eq 0 ]]; then
    CURRENT_STAGE=prepare
    prepare_project || { record prepare FAIL "${GATE_FAIL:-install steps of the project failed}"; exit 5; }
    CURRENT_STAGE=test-db
    test_db_up; test_db_check
  fi

  declare -A codes=([lint]=10 [unit]=20 [functional]=30 [regression]=40)
  for s in "${stages[@]}"; do
    CURRENT_STAGE="$s"
    if [[ "$s" == security ]]; then
      if run_security; then STAGE_RESULT[security]=PASS; else STAGE_RESULT[security]=FAIL; log "stage security FAILED"; exit 70; fi
      continue
    fi
    stage_dirs "$s"
    # exact start of the stage, no margin: a build report older than this does not count (V-13)
    local mark="$REPORTS_ROOT/$s/.start"
    touch "$mark"
    rc=0; run_stage "$s" || rc=$?
    if [[ $rc -eq 2 ]]; then log "flaky test detected in $s"; exit 60; fi
    if has_stack gradle || has_stack android; then collect_build_reports "$mark"; fi
    if [[ $rc -ne 0 ]]; then log "stage $s FAILED"; exit "${codes[$s]}"; fi
    if [[ "$s" != lint ]]; then
      CURRENT_STAGE="no-skip/$s"
      check_no_skipped "$s" || { STAGE_RESULT[$s]=FAIL; log "stage $s FAILED: skipped test"; exit 65; }
      CURRENT_STAGE="tests/$s"
      tests_ran "$s" || { STAGE_RESULT[$s]=FAIL; log "stage $s FAILED: no test executed"; exit 80; }
    fi
    if [[ "$s" == regression ]]; then
      CURRENT_STAGE=coverage
      changed_coverage || exit 50
    fi
  done
  CURRENT_STAGE=completeness
  check_complete || exit 80
  CURRENT_STAGE=""
  log "all required stages passed: ${REQUIRED[*]}"
  # main never returns, so bash reads nothing after the last line (F-11)
  exit 0
}

main "$@"

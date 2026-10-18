#!/usr/bin/env bash
# Behaviour tests for scripts/test-pipeline.sh (RSK-04 and the exemption rule, Taskora).
# Each case runs the real script in a throwaway git repository, with stage commands written for the case.
# No Docker, no network, no database: TEST_DATABASE_URL points nowhere and is never used. diff-cover is a
# stub on PATH that only checks it was given a report. Exits non-zero if any case fails.
# Needs bash, git, python3 and GNU date. No case is skipped: a missing prerequisite fails the suite.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PASS=0
FAIL=0
FAILED=()
TODAY="$(date -u +%F)"
SOON="$(date -u -d '+10 days' +%F)"
PAST="$(date -u -d '-1 day' +%F)"
LINK="https://github.com/Gaetan-PRUVOT-SQS/Taskora/issues/7#issuecomment-111"
REASON="the coverage tool cannot read the generated sources yet"
# the cases never connect: a random password, so no literal one sits in the repo (GH-01 check)
DB_PW="$(od -An -tx1 -N12 /dev/urandom | tr -d ' \n')"

for tool in git python3 date; do
  command -v "$tool" >/dev/null || { echo "missing prerequisite: $tool" >&2; exit 1; }
done

# a CI run of this suite must not leak its own settings into the cases
unset GITHUB_EVENT_NAME PIPELINE_BASE_SETTINGS COVERAGE_MIN FLAKY_RERUNS SECURITY_CHECKS PIPELINE_REQUIRED_STAGES
for k in COVERAGE_EXEMPT_REASON COVERAGE_EXEMPT_UNTIL COVERAGE_EXEMPT_DECISION E2E_EXEMPT_REASON E2E_EXEMPT_UNTIL E2E_EXEMPT_DECISION; do
  unset "$k"
done

mkdir -p "$WORK/bin"
# diff-cover stub: passes when given at least one existing report
cat >"$WORK/bin/diff-cover" <<'SH'
#!/bin/sh
for a in "$@"; do case "$a" in --*) ;; *) [ -f "$a" ] && { echo "diff-cover stub: $a"; exit 0; } ;; esac; done
echo "diff-cover stub: no report" >&2; exit 1
SH
chmod +x "$WORK/bin/diff-cover"

# junit helper used by the stage commands: junit N [skipped]
cat >"$WORK/bin/junit" <<'SH'
#!/bin/sh
n="$1"; mkdir -p "$JUNIT_DIR"
{ echo '<testsuites><testsuite name="t" tests="'"$n"'">'
  i=0; while [ "$i" -lt "$n" ]; do echo "<testcase name=\"c$i\"/>"; i=$((i + 1)); done
  [ "${2:-}" = skipped ] && echo '<testcase name="s"><skipped/></testcase>'
  echo '</testsuite></testsuites>'; } >"$JUNIT_DIR/stub-$$.xml"
SH
chmod +x "$WORK/bin/junit"
# failing stage command that counts its runs
printf '#!/bin/sh\necho run >> attempts.txt\nexit 1\n' >"$WORK/bin/failing-tests"
chmod +x "$WORK/bin/failing-tests"

fresh() { # fresh: new repo with the script and an empty settings file, one commit
  rm -rf "$WORK/repo" "$WORK/base.env"
  mkdir -p "$WORK/repo/scripts"
  # the script and its helpers (settings reader, database and credential checks), checked at startup
  cp -R "$HERE/../." "$WORK/repo/scripts/"
  printf 'test-results/\n' >"$WORK/repo/.gitignore"
  : >"$WORK/repo/.test-pipeline.env"
  git -C "$WORK/repo" init -q -b main
  git -C "$WORK/repo" -c user.email=t@t -c user.name=t add -A
  git -C "$WORK/repo" -c user.email=t@t -c user.name=t commit -q -m init
  git -C "$WORK/repo" update-ref refs/remotes/origin/main HEAD
}
feature() { mkdir -p "$WORK/repo/src"; printf 'export const x = 1;\n' >"$WORK/repo/src/x.js"; commit feature; }
settings() { printf '%s\n' "$@" >"$WORK/repo/.test-pipeline.env"; }
base() { printf '%s\n' "$@" >"$WORK/base.env"; }
commit() { git -C "$WORK/repo" -c user.email=t@t -c user.name=t add -A && git -C "$WORK/repo" -c user.email=t@t -c user.name=t commit -q -m "$1"; }

# case_ NAME EXPECTED_EXIT PATTERN [env assignments...] -- [script args...]
case_() {
  local name="$1" want="$2" pat="$3"; shift 3
  local -a envs=() args=()
  while [[ $# -gt 0 && "$1" != -- ]]; do envs+=("$1"); shift; done
  [[ "${1:-}" == -- ]] && shift
  args=("$@")
  local out rc=0
  out="$(cd "$WORK/repo" && env -u CI -u GITHUB_ACTIONS PATH="$WORK/bin:$PATH" BASE_REF=origin/main \
          "TEST_DATABASE_URL=postgresql://t:${DB_PW}@127.0.0.1:9/t" "${envs[@]}" bash scripts/test-pipeline.sh "${args[@]}" 2>&1)" || rc=$?
  if [[ $rc -eq $want ]] && grep -qE -- "$pat" <<<"$out"; then
    PASS=$((PASS + 1)); printf 'ok    %s (exit %s)\n' "$name" "$rc"
  else
    FAIL=$((FAIL + 1)); FAILED+=("$name"); printf 'FAIL  %s: exit %s, expected %s, pattern /%s/\n' "$name" "$rc" "$want" "$pat"
    printf '%s\n' "$out" | tail -n 12 | sed 's/^/      | /'
  fi
}
PR=(GITHUB_EVENT_NAME=pull_request "PIPELINE_BASE_SETTINGS=$WORK/base.env")

# ---- settings and floors
fresh; case_ "empty settings pass" 0 'settings OK: COVERAGE_MIN=80 FLAKY_RERUNS=0' -- --check-config
fresh; settings 'COVERAGE_MIN=70'; case_ "COVERAGE_MIN under the floor is refused" 2 'COVERAGE_MIN=70 refused' -- --check-config
fresh; settings 'COVERAGE_MIN=90'; case_ "COVERAGE_MIN raised is kept" 0 'COVERAGE_MIN=90' -- --check-config
fresh; settings 'FLAKY_RERUNS=2'; case_ "FLAKY_RERUNS=2 in the file is refused" 2 'no rerun is allowed' -- --check-config
fresh; case_ "FLAKY_RERUNS=1 in the environment is refused" 2 'no rerun is allowed' FLAKY_RERUNS=1 -- --check-config
fresh; settings 'COVERAGE_MIN=90' 'COVERAGE_MIN=80'; case_ "a key set twice is refused" 2 'COVERAGE_MIN is set twice' -- --check-config
fresh; settings "COVERAGE_EXEMPT_REASON=\"$REASON\"" "COVERAGE_EXEMPT_UNTIL=$SOON" "COVERAGE_EXEMPT_DECISION=\"$TODAY $LINK\"" 'COVERAGE_EXEMPT_REASON=""'
case_ "an exemption key set twice is refused" 2 'COVERAGE_EXEMPT_REASON is set twice' -- --check-config
fresh; settings 'SERVICES_UP_CMD=true'; case_ "unknown key in the head file is refused" 2 'SERVICES_UP_CMD cannot be set from the repo' -- --check-config

# ---- exemptions: file only, decision of Gaetan on Taskora, expiry
fresh; settings "COVERAGE_EXEMPT_REASON=\"$REASON\"" "COVERAGE_EXEMPT_UNTIL=$SOON" "COVERAGE_EXEMPT_DECISION=\"$TODAY $LINK\""
case_ "valid exemption passes" 0 "exemption COVERAGE_EXEMPT_REASON until $SOON" -- --check-config
fresh; case_ "exemption from the environment is refused (GITHUB_ENV)" 2 'E2E_EXEMPT_REASON is set in the environment' \
  "E2E_EXEMPT_REASON=$REASON" "E2E_EXEMPT_UNTIL=$SOON" "E2E_EXEMPT_DECISION=$TODAY $LINK" -- --check-config
fresh; case_ "exemption decision alone in the environment is refused" 2 'COVERAGE_EXEMPT_DECISION is set in the environment' \
  "COVERAGE_EXEMPT_DECISION=$TODAY $LINK" -- --check-config
fresh; settings "COVERAGE_EXEMPT_REASON=\"$REASON\"" "COVERAGE_EXEMPT_UNTIL=$SOON"
case_ "exemption without decision is refused" 2 'needs COVERAGE_EXEMPT_DECISION' -- --check-config
fresh; settings "COVERAGE_EXEMPT_REASON=\"$REASON\"" "COVERAGE_EXEMPT_UNTIL=$SOON" \
  "COVERAGE_EXEMPT_DECISION=\"$TODAY https://github.com/Gaetan-PRUVOT-SQS/other/issues/1#issuecomment-1\""
case_ "decision on another repository is refused" 2 'must be given on Gaetan-PRUVOT-SQS/Taskora' -- --check-config
fresh; settings "COVERAGE_EXEMPT_REASON=\"$REASON\"" "COVERAGE_EXEMPT_UNTIL=$SOON" \
  "COVERAGE_EXEMPT_DECISION=\"$TODAY https://github.com/someone/Taskora/issues/1#issuecomment-1\""
case_ "decision on a repository of someone else is refused" 2 'must be given on Gaetan-PRUVOT-SQS/Taskora' -- --check-config
fresh; mkdir -p "$WORK/repo/docs/decisions"; printf 'Decision: Gaetan PRUVOT\nCOVERAGE_EXEMPT\n' >"$WORK/repo/docs/decisions/$TODAY-x.md"
settings "COVERAGE_EXEMPT_REASON=\"$REASON\"" "COVERAGE_EXEMPT_UNTIL=$SOON" "COVERAGE_EXEMPT_DECISION=\"$TODAY docs/decisions/$TODAY-x.md\""
case_ "decision file of the repo is refused (a PR could add it)" 2 'must be a link to a comment or review' -- --check-config
fresh; settings "COVERAGE_EXEMPT_REASON=\"$REASON\"" "COVERAGE_EXEMPT_UNTIL=$PAST" "COVERAGE_EXEMPT_DECISION=\"$PAST $LINK\""
case_ "expired exemption fails, --check-config included" 2 'expired' -- --check-config
fresh; settings "COVERAGE_EXEMPT_REASON=\"too short\"" "COVERAGE_EXEMPT_UNTIL=$SOON" "COVERAGE_EXEMPT_DECISION=\"$TODAY $LINK\""
case_ "short reason is refused" 2 'too short' -- --check-config

# ---- pull request runs: base branch settings only
fresh; case_ "PR run without base settings is refused" 2 'without PIPELINE_BASE_SETTINGS' GITHUB_EVENT_NAME=pull_request -- --check-config
fresh; base 'COVERAGE_MIN=90'; settings 'COVERAGE_MIN=80'
case_ "PR head cannot lower the base COVERAGE_MIN" 0 'COVERAGE_MIN=90' "${PR[@]}" -- --check-config
fresh; base 'COVERAGE_MIN=90'
case_ "base COVERAGE_MIN raise applies (no env override)" 0 'settings OK: COVERAGE_MIN=90' "${PR[@]}" -- --check-config
fresh; base ''; case_ "COVERAGE_MIN in the environment of a PR run is refused" 2 'COVERAGE_MIN is set in the environment on a pull request' \
  "${PR[@]}" COVERAGE_MIN=80 -- --check-config
fresh; base ''; case_ "UNIT_CMD in the environment of a PR run is refused" 2 'UNIT_CMD is set in the environment on a pull request' \
  "${PR[@]}" 'UNIT_CMD=node -e 0' -- --check-config
fresh; base ''; settings "COVERAGE_EXEMPT_REASON=\"$REASON\"" "COVERAGE_EXEMPT_UNTIL=$SOON" "COVERAGE_EXEMPT_DECISION=\"$TODAY $LINK\""
case_ "PR head exemption is ignored" 0 'ignored from the head .test-pipeline.env.*COVERAGE_EXEMPT_REASON' "${PR[@]}" -- --check-config
fresh; base 'UNIT_CMD="junit 1"'; settings 'UNIT_CMD="node -e 0"'
case_ "PR head stage command is ignored, the base one runs" 0 'tests/unit \| PASS' "${PR[@]}" -- unit
fresh; settings 'COVERAGE_MIN=80'
case_ "base settings inside the worktree are refused" 2 'inside the tested worktree' GITHUB_EVENT_NAME=pull_request \
  "PIPELINE_BASE_SETTINGS=$WORK/repo/.test-pipeline.env" -- --check-config
fresh; base 'COVERAGE_MIN=90'; ln -s "$WORK/base.env" "$WORK/link.env"
case_ "base settings through a symlink are refused" 2 'not a regular file' GITHUB_EVENT_NAME=pull_request \
  "PIPELINE_BASE_SETTINGS=$WORK/link.env" -- --check-config
rm -f "$WORK/link.env"
fresh; base 'FLAKY_RERUNS=2' 'COVERAGE_MIN=80'
case_ "base FLAKY_RERUNS=2 (older main) is ignored, no rerun" 0 'FLAKY_RERUNS=0' "${PR[@]}" -- --check-config
fresh; base "SERVICES_UP_CMD='if true; then :; fi'" 'REQUIRED_ENV="TEST_DATABASE_URL"' 'COVERAGE_MIN=85'
case_ "unknown keys of an older base are dropped with a warning" 0 'unknown keys in the base .test-pipeline.env, ignored: SERVICES_UP_CMD REQUIRED_ENV' \
  "${PR[@]}" -- --check-config
fresh; base 'COVERAGE_MIN=85' 'COVERAGE_MIN=95'
case_ "a key set twice in the base is refused" 2 'COVERAGE_MIN is set twice' "${PR[@]}" -- --check-config

# ---- stages: no rerun, at least one test, no skipped test
fresh; settings 'UNIT_CMD="junit 3"'
case_ "a stage with test cases passes" 0 'tests/unit \| PASS \| 3 test case' -- unit
fresh; settings 'UNIT_CMD="node -e 0"'
case_ "a stage that runs no test fails (no-op command)" 80 'no test executed' -- unit
fresh; settings 'UNIT_CMD="junit 0"'
case_ "a stage whose report has zero test case fails" 80 'no test executed' -- unit
fresh; mkdir -p "$WORK/repo/test-results/junit/unit"
printf '<testsuites><testsuite tests="1"><testcase name="old"/></testsuite></testsuites>\n' >"$WORK/repo/test-results/junit/unit/old.xml"
touch -d '-1 hour' "$WORK/repo/test-results/junit/unit/old.xml"; settings 'UNIT_CMD="node -e 0"'
case_ "a JUnit report left by an earlier run does not count" 80 'no test executed' -- unit
fresh; settings 'UNIT_CMD="junit 2 skipped"'
case_ "a skipped test in a report fails the stage" 65 'skipped tests reported' -- unit
fresh; settings 'UNIT_CMD="failing-tests"'
case_ "a failing stage fails at once (exit 20)" 20 'failed \(FLAKY_RERUNS=0, no rerun\)' -- unit
if [[ "$(wc -l <"$WORK/repo/attempts.txt" 2>/dev/null)" -eq 1 ]]; then PASS=$((PASS + 1)); echo "ok    the failing stage ran once, no rerun"
else FAIL=$((FAIL + 1)); FAILED+=("no rerun"); echo "FAIL  the failing stage ran $(wc -l <"$WORK/repo/attempts.txt" 2>/dev/null || echo 0) times"; fi
fresh; mkdir -p "$WORK/repo/test"; printf 'it.skip("x", () => {});\n' >"$WORK/repo/test/a.test.js"; settings 'UNIT_CMD="junit 1"'
case_ "a skip marker in a test source fails the stage" 65 'skipped, focused or quarantined test markers' -- unit

# ---- coverage: only reports this run wrote in its own COVERAGE_DIR, outside the checkout (V-04)
fresh; printf '<coverage line-rate="1"/>\n' >"$WORK/repo/coverage.xml"; commit "coverage report"; feature
settings 'REGRESSION_CMD="junit 1"'
case_ "a committed coverage.xml is not used" 50 'no coverage XML report written by this run in COVERAGE_DIR' -- regression
fresh; feature; printf '<coverage line-rate="1"/>\n' >"$WORK/repo/coverage.xml"; touch -d '-1 hour' "$WORK/repo/coverage.xml"
settings 'REGRESSION_CMD="junit 1"'
case_ "a coverage.xml left by an earlier run is not used" 50 'no coverage XML report written by this run in COVERAGE_DIR' -- regression
fresh; feature; settings 'REGRESSION_CMD="junit 1 && mkdir -p coverage && echo \"<coverage/>\" > coverage/cobertura-coverage.xml"'
case_ "a coverage report the stage writes in the repo is not used" 50 'no coverage XML report written by this run in COVERAGE_DIR' -- regression
fresh; feature; settings 'REGRESSION_CMD="junit 1 && echo coverage > $COVERAGE_DIR/cobertura-coverage.xml"'
case_ "a coverage report written in COVERAGE_DIR is used" 0 'coverage \| PASS' -- regression
fresh; mkdir -p "$WORK/repo/test-results/junit/unit"; printf '<testsuites><testsuite tests="1"><testcase name="w"/></testsuite></testsuites>\n' >"$WORK/repo/test-results/junit/unit/w.xml"
settings 'UNIT_CMD="mkdir -p test-results/junit/unit && cp test-results/junit/unit/w.xml test-results/junit/unit/x.xml"'
case_ "a JUnit report written in the repo during the stage does not count" 80 'no test executed' -- unit

# ---- base ref (V-17) and settings reader (F-13)
fresh; settings 'REGRESSION_CMD="junit 1"'
case_ "BASE_REF=HEAD is refused" 2 'BASE_REF=HEAD refused' BASE_REF=HEAD -- --check-config
fresh; settings 'REGRESSION_CMD="junit 1 && echo coverage > $COVERAGE_DIR/c.xml"'
case_ "a base equal to HEAD measures nothing and fails" 50 'is HEAD or ahead of it' -- regression
fresh; printf 'UNIT_CMD=junit 1 \x1c#|| true\n' >"$WORK/repo/.test-pipeline.env"
case_ "a separator character (U+001C) in the settings is refused" 2 'U\+001C refused' -- --check-config
fresh; printf 'COVERAGE_MIN=90\xc2\x85COVERAGE_MIN=80\n' >"$WORK/repo/.test-pipeline.env"
case_ "NEL (U+0085) in the settings is refused" 2 'U\+0085 refused' -- --check-config

# ---- prepare (F-11): install steps run by the pipeline itself, Chromium for the DnD check of the e2e workspace
mkdir -p "$WORK/prep-bin"
printf '#!/bin/sh\necho "npm-stub: $*"\n' >"$WORK/prep-bin/npm"
printf '#!/bin/sh\necho "npx-stub: $*"\n' >"$WORK/prep-bin/npx"
chmod +x "$WORK/prep-bin/npm" "$WORK/prep-bin/npx"
fresh; mkdir -p "$WORK/repo/test/e2e"
printf '{"name":"t","private":true,"workspaces":["test/e2e"]}\n' >"$WORK/repo/package.json"
printf '{"name":"e2e","devDependencies":{"playwright":"^1.58.0"}}\n' >"$WORK/repo/test/e2e/package.json"
settings 'LINT_CMD="junit 1"'; commit e2e
case_ "prepare installs Chromium for the playwright package of the e2e workspace" 0 \
  'npx-stub: --no-install --workspace=e2e playwright install --with-deps chromium' \
  PIPELINE_PREPARE=1 "PATH=$WORK/prep-bin:$WORK/bin:$PATH" -- lint

# ---- run from a trusted copy (F-11): the checkout copy of the script is rewritten during the stage
fresh; settings 'UNIT_CMD="junit 2 && echo exit 0 > scripts/test-pipeline.sh && false"'
cp -R "$WORK/repo/scripts" "$WORK/trusted"
out="$(cd "$WORK" && env -u CI -u GITHUB_ACTIONS PATH="$WORK/bin:$PATH" BASE_REF=origin/main PIPELINE_ROOT="$WORK/repo" \
       "TEST_DATABASE_URL=postgresql://t:${DB_PW}@127.0.0.1:9/t" bash "$WORK/trusted/test-pipeline.sh" unit 2>&1)"; rc=$?
if [[ $rc -eq 20 ]] && grep -q 'exit 0' "$WORK/repo/scripts/test-pipeline.sh"; then
  PASS=$((PASS + 1)); echo "ok    run from a trusted copy: rewriting the checkout script changes nothing (exit 20)"
else
  FAIL=$((FAIL + 1)); FAILED+=("trusted copy"); echo "FAIL  run from a trusted copy: exit $rc"; printf '%s\n' "$out" | tail -n 8 | sed 's/^/      | /'
fi
rm -rf "$WORK/trusted"

echo
echo "test-pipeline.test.sh: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] || { printf 'failed: %s\n' "${FAILED[@]}"; exit 1; }

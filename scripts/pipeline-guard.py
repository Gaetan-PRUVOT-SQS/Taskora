#!/usr/bin/env python3
"""pipeline-guard: compare the pipeline policy of a pull request head with its base branch.

Run by .github/workflows/pipeline-config-guard.yml on workflow_run, so both this script and the workflow
come from the default branch: a pull request cannot change the rules it is checked against.
The base and head files are read as data (fetched through the API), PR code is never executed.

Usage: pipeline-guard.py BASE_DIR HEAD_DIR [--changed FILE] --repo OWNER/NAME --pr NUMBER
  BASE_DIR, HEAD_DIR  copies of the policy files at the base and head commits (missing file = absent)
       pipeline-guard.py fetch --repo R --run-id ID --head-sha SHA --out DIR
  checks the run comes from .github/workflows/test-pipeline.yml (path and workflow_id, not a homonym) for
  exactly one open PR on the default branch, then reads both git trees and writes DIR/base, DIR/head,
  DIR/changed.txt and DIR/pr.env (fails closed on a truncated tree or more than 3000 changed files)
       pipeline-guard.py verify --repo R --sha SHA [--final]
  fails if SHA carries a pipeline-config-guard commit status (the guard writes none, so any is forged) or a
  "pipeline" check run not written by test-pipeline.yml; --final also wants the latest guard run for SHA
  (run-name "pipeline-config-guard SHA RUN_ID") and a pipeline check run to have succeeded (run it before merging)
Environment:
  GUARD_TODAY         YYYY-MM-DD, for tests only, ignored when GITHUB_ACTIONS=true (default: today in UTC)
  gh is taken from PATH (the tests put a stub first)

Fails (exit 1), without exception, when the head:
  - lowers a threshold in .test-pipeline.env, in the workflow env or in the floors of scripts/test-pipeline.sh
    (a raise is allowed);
  - adds, prolongs or changes an exemption without a valid written decision from Gaetan PRUVOT;
  - removes or renames the gate job "pipeline" or the guard, changes their triggers, conditions or steps,
    removes a job or a protected step of test-pipeline, adds continue-on-error or a constant false "if",
    or sets a policy key or PIPELINE_BASE_SETTINGS in the workflow env.
Structural changes to the gate, the guard or the triggers are accepted only with
PIPELINE_CHANGE_DECISION="YYYY-MM-DD <link>" in the head .test-pipeline.env, a decision from Gaetan that names
"pipeline-config-guard" and is at most 30 days old. Lowering a threshold has no escape.
Exit codes: 0 pass, 1 policy violation, 2 usage or unreadable input.
"""
from __future__ import annotations

import argparse
import datetime as dt
import fnmatch
import importlib.util
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import yaml

# F-13: one reader of .test-pipeline.env for the guard and the script, loaded from next to this file
# (the default branch copy, like the guard itself)
_spec = importlib.util.spec_from_file_location("pipeline_settings", Path(__file__).with_name("pipeline-settings.py"))
assert _spec and _spec.loader
pipeline_settings = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pipeline_settings)

DECISION_OWNER = "Gaetan-PRUVOT-SQS"
DECISION_NAME = "Gaetan PRUVOT"
EXEMPT_MAX_DAYS = 30
SETTINGS = ".test-pipeline.env"
SCRIPT = "scripts/test-pipeline.sh"
PIPELINE_WF = ".github/workflows/test-pipeline.yml"
GUARD_WF = ".github/workflows/pipeline-config-guard.yml"
GUARD_SCRIPT = "scripts/pipeline-guard.py"
GATE_JOB = "pipeline"
GUARD_CONTEXT = "pipeline-config-guard"
REQUIRED_CHECKS = (GATE_JOB, GUARD_CONTEXT)     # the checks the ruleset requires
FORBIDDEN_WRITES = ("statuses", "checks")       # no job may hold them, the guard included: none can post a verdict
EXEMPTIONS = ("COVERAGE_EXEMPT", "E2E_EXEMPT", "SUPPRESS_EXEMPT")
POLICY_KEYS = {
    "COVERAGE_MIN", "FLAKY_RERUNS", "REQUIRE_DEVICE", "HADOLINT_THRESHOLD", "DC_FAIL_CVSS", "DC_SUPPRESSION",
    "SECRETS_FULL_HISTORY", "E2E_SPEC", "PIPELINE_CHANGE_DECISION", "PIPELINE_TRUSTED_PATHS",
} | {f"{e}_{s}" for e in EXEMPTIONS for s in ("REASON", "UNTIL", "DECISION")}
# floors in scripts/test-pipeline.sh: +1 = a higher value is stricter, -1 = a lower value is stricter, 0 = must not change
SCRIPT_FLOORS = {
    "COVERAGE_FLOOR": 1, "FLAKY_RERUNS_ALLOWED": 0, "DC_CVSS_CEILING": -1, "MIN_REASON_LEN": 1,
    "EXEMPT_MAX_DAYS": -1, "NODE_MAJOR_MIN": 1, "DECISION_OWNER": 0, "DECISION_NAME": 0,
}
THRESHOLD_KEYS = ("COVERAGE_MIN", "FLAKY_RERUNS", "DC_FAIL_CVSS", "HADOLINT_THRESHOLD", "REQUIRE_DEVICE",
                  "SECRETS_FULL_HISTORY", "E2E_SPEC", "DC_SUPPRESSION")
# Allowlist (F-01): outside .test-pipeline.env (thresholds, exemptions) and the decision registry, a change
# of anything that runs or configures the pipeline is structural and needs PIPELINE_CHANGE_DECISION.
# Everything else in the repo (application code, its tests) is the code under test.
# Every file under scripts/ is trusted, not only the known ones: a helper the pipeline runs (a test database
# starter, an env setup) could rewrite the script or the reports at run time.
TRUSTED = (".github/*", "scripts/*")
# PIPELINE_TRUSTED_PATHS (base .test-pipeline.env): more globs of the same kind, such as the test runners the
# npm scripts call (test/scripts/*). Read from the base only, so a PR cannot take a path out of it.
EXTRA_TRUSTED: tuple[str, ...] = ()
# F-11, V-04: files that run code before or during the pipeline (install hooks, build of a Python project,
# package manager settings), or decide what the tests measure (coverage and test runner configs, git
# attributes that hide a diff). Wherever they are in the repo, a change is structural.
RUN_OR_MEASURE_FILES = {
    ".npmrc", ".yarnrc", ".yarnrc.yml", ".pnpmfile.cjs", "pnpm-workspace.yaml", "setup.py", "setup.cfg",
    "pyproject.toml", "pytest.ini", "tox.ini", ".coveragerc", ".c8rc", ".c8rc.json", ".nycrc", ".nycrc.json",
    ".nycrc.yml", ".nycrc.yaml", ".gitattributes", ".babelrc", ".babelrc.json", "jest.config.json",
}
RUN_OR_MEASURE_RE = re.compile(r"(?:(?:jest|vitest|vite|karma|playwright|cypress|nyc|babel|vitest\.workspace)\.config"
                               r"|vitest\.workspace|\.mocharc|\.babelrc)\.[A-Za-z]+")
# keys of a package.json that run code (npm scripts, lifecycle hooks included) or configure coverage and tests
PACKAGE_KEYS = ("scripts", "c8", "nyc", "jest", "vitest", "mocha", "ava", "babel", "config", "workspaces")
DECISIONS_DIR = "docs/decisions/"
# F-04: the security tools' own suppression files and inline markers. Adding or extending one is an
# exemption from a security finding, so it needs SUPPRESS_EXEMPT (decision of Gaetan, end date).
SUPPRESSION_FILES = {".gitleaksignore", ".gitleaks.toml", "gitleaks.toml", "osv-scanner.toml", ".semgrepignore",
                     ".hadolint.yaml", ".hadolint.yml", "zizmor.yml", ".zizmor.yml", ".trivyignore", ".trivyignore.yaml",
                     ".snyk", "dependency-check-suppressions.xml"}
# V-14: "nosem" is the short form semgrep honours too; the coverage markers hide lines from the coverage gate
# V-04: only the test runners write reports into the directories the pipeline gives them. Project code that
# names these directories could forge a JUnit or coverage report, so a new reference needs a decision.
REPORT_DIR_RE = re.compile(r"\b(?:JUNIT_DIR|COVERAGE_DIR|NODE_V8_COVERAGE|JEST_JUNIT_OUTPUT_DIR|PIPELINE_REPORTS?)\b|pipeline-reports")
SUPPRESSION_MARKERS = re.compile(r"nosemgrep|\bnosem\b|gitleaks:allow|hadolint\s+ignore|zizmor:\s*ignore|#\s*nosec\b|NOSONAR"
                                 r"|\bcodeql\[|\blgtm\[|trivy:ignore|checkov:skip"
                                 r"|\b(?:c8|v8|istanbul)\s+ignore\b|pragma:\s*no\s*(?:cover|branch)|LCOV_EXCL_")
HADOLINT_RANK = {"warning": 0, "info": 1, "style": 2}
FALSE_IFS = {"false", "${{ false }}", "${{false}}", "0", "${{ 0 }}"}

errors: list[str] = []
warnings: list[str] = []
# GUARD_TODAY is a test hook only, ignored inside GitHub Actions (V-08)
_today_env = os.environ.get("GUARD_TODAY") if os.environ.get("GITHUB_ACTIONS") != "true" else None
today = dt.date.fromisoformat(_today_env or dt.datetime.now(dt.UTC).date().isoformat())


def fail(msg: str) -> None:
    errors.append(msg)


def read(root: Path, rel: str) -> str | None:
    p = root / rel
    if p.is_symlink():
        fail(f"{rel} is a symlink")
        return None
    return p.read_text(encoding="utf-8") if p.is_file() else None


def snapshot(root: Path) -> dict[str, bytes]:
    """Every file under root, symlinks as their target, so a type change is a change too."""
    out: dict[str, bytes] = {}
    for p in sorted(root.rglob("*")):
        rel = p.relative_to(root).as_posix()
        if p.is_symlink():
            out[rel] = b"symlink:" + os.readlink(p).encode()
        elif p.is_file():
            out[rel] = p.read_bytes()
    return out


def trusted(path: str) -> bool:
    return any(fnmatch.fnmatchcase(path, pat) for pat in TRUSTED + EXTRA_TRUSTED)


def runs_or_measures(path: str) -> bool:
    name = path.rsplit("/", 1)[-1]
    return name in RUN_OR_MEASURE_FILES or bool(RUN_OR_MEASURE_RE.fullmatch(name))


def read_settings(root: Path) -> bytes | None:
    p = root / SETTINGS
    if p.is_symlink():
        fail(f"{SETTINGS} is a symlink")
        return None
    return p.read_bytes() if p.is_file() else None


def parse_env(data: bytes | None) -> dict[str, str]:
    """The settings as scripts/test-pipeline.sh reads them: same reader, same refusals (F-13)."""
    return dict(pipeline_settings.parse(data or b"", SETTINGS))


def parse_floors(text: str | None) -> dict[str, str]:
    out = {}
    for m in re.finditer(r'^readonly ([A-Z_]+)=("?)([^"\n]*)\2\s*$', text or "", re.MULTILINE):
        out[m.group(1)] = m.group(3)
    return out


def load_yaml(text: str | None, label: str) -> dict | None:
    if text is None:
        return None
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as e:
        fail(f"{label}: not valid YAML ({e.__class__.__name__})")
        return None
    if not isinstance(data, dict):
        fail(f"{label}: not a workflow")
        return None
    # PyYAML reads the "on" key as True
    if True in data:
        data["on"] = data.pop(True)
    return data


def num(v: str | None, default: float) -> float | None:
    if v is None or v == "":
        return default
    try:
        return float(v)
    except ValueError:
        return None


# ---------- decisions ----------
# A decision is bound to what it allows (F-08): an explicit APPROVE line, not a word somewhere in a comment.
#   exemption (registry file docs/decisions/YYYY-MM-DD-<slug>.md, on the base, unchanged):
#     Decision: Gaetan PRUVOT / Source: <comment link> / APPROVE <KIND> <owner>/<repo> until YYYY-MM-DD
#   structural change (PIPELINE_CHANGE_DECISION="YYYY-MM-DD <comment link>"):
#     a comment of Gaetan with the line  APPROVE PIPELINE_CHANGE <owner>/<repo>#<pr>
# Comments are read through the API: author Gaetan-PRUVOT-SQS, same date, not posted through an app
# (V-07: agents act through apps or tokens; a comment typed by Gaetan on github.com has no app).
LINK_RE = (r"https://github\.com/([A-Za-z0-9-]+)/([A-Za-z0-9._-]+)/(issues|pull)/(\d+)"
           r"#(issuecomment|pullrequestreview)-(\d+)")
REPO = ""
PR = ""


def read_comment(where: str, ddate: dt.date, lines: list[str]) -> str | None:
    """None if `where` is a comment or review of Gaetan dated ddate, typed by hand, containing every line."""
    gh = re.fullmatch(LINK_RE, where)
    if not gh:
        return f"{where} is not a GitHub comment or review link"
    owner, repo, _, number, kind, cid = gh.groups()
    if owner != DECISION_OWNER:
        return f"decision on {owner}/{repo}, it must be on a {DECISION_OWNER} repository"
    api = (f"repos/{owner}/{repo}/issues/comments/{cid}" if kind == "issuecomment"
           else f"repos/{owner}/{repo}/pulls/{number}/reviews/{cid}")
    try:
        raw = subprocess.run(["gh", "api", api], check=True, capture_output=True, text=True).stdout
        data = json.loads(raw)
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError):
        return f"cannot read {where} through the API"
    login = (data.get("user") or {}).get("login")
    when = (data.get("created_at") or data.get("submitted_at") or "")[:10]
    if login != DECISION_OWNER:
        return f"{where} was written by {login}, not {DECISION_OWNER}"
    if data.get("performed_via_github_app"):
        return f"{where} was posted through an app, not typed by {DECISION_NAME}"
    if when != ddate.isoformat():
        return f"{where} is dated {when or 'unknown'}, not {ddate}"
    body = {ln.strip() for ln in (data.get("body") or "").splitlines()}
    missing = [ln for ln in lines if ln not in body]
    if missing:
        return f"{where} does not contain the line '{missing[0]}'"
    return None


def parse_ref(ref: str) -> tuple[dt.date, str] | str:
    m = re.fullmatch(r"(\d{4}-\d{2}-\d{2})\s+(\S+)", ref.strip())
    if not m:
        return f'expected "YYYY-MM-DD <where>", got "{ref}"'
    try:
        ddate = dt.date.fromisoformat(m.group(1))
    except ValueError:
        return f"{m.group(1)} is not a valid date"
    if ddate > today:
        return f"decision dated {ddate}, in the future"
    return ddate, m.group(2)


def approvals(text: str, kind: str) -> list[dt.date]:
    out = []
    for m in re.finditer(rf"^APPROVE {kind} (\S+) until (\d{{4}}-\d{{2}}-\d{{2}})$", text, re.MULTILINE):
        if m.group(1) == REPO:
            try:
                out.append(dt.date.fromisoformat(m.group(2)))
            except ValueError:
                pass
    return out


def check_decision(ref: str, kind: str, base: Path, head: Path, until: dt.date | None = None) -> str | None:
    """Registry decision for an exemption: None if valid, else the reason."""
    parsed = parse_ref(ref)
    if isinstance(parsed, str):
        return parsed
    ddate, where = parsed
    fm = re.fullmatch(r"docs/decisions/(\d{4}-\d{2}-\d{2})-[a-z0-9-]+\.md", where)
    if not fm:
        return f"{where} is not a file of the decision registry (docs/decisions/YYYY-MM-DD-<slug>.md)"
    if fm.group(1) != ddate.isoformat():
        return f"{where} is not dated {ddate}"
    btext, htext = read(base, where), read(head, where)
    if btext is None:
        return f"{where} is not on the base branch: a decision file cannot arrive in the PR that uses it"
    if htext != btext:
        return f"{where} is changed or removed by this PR"
    if not re.search(rf"^Decision: {re.escape(DECISION_NAME)}$", btext, re.MULTILINE):
        return f"{where} has no line 'Decision: {DECISION_NAME}'"
    if not REPO:
        return "the repository is unknown (--repo), the decision cannot be matched"
    ends = approvals(btext, kind)
    if not ends:
        return f"{where} has no line 'APPROVE {kind} {REPO} until YYYY-MM-DD'"
    if until is not None and until > max(ends):
        return f"{kind}_UNTIL={until} goes past the end date approved in {where} ({max(ends)})"
    return None


def check_change_decision(ref: str) -> str | None:
    """PIPELINE_CHANGE_DECISION: a comment of Gaetan approving this very pull request, at most 30 days old."""
    parsed = parse_ref(ref)
    if isinstance(parsed, str):
        return parsed
    ddate, where = parsed
    if (today - ddate).days > EXEMPT_MAX_DAYS:
        return f"decision of {ddate} is more than {EXEMPT_MAX_DAYS} days old"
    if not REPO or not PR:
        return "the repository or pull request is unknown (--repo, --pr), the decision cannot be matched"
    return read_comment(where, ddate, [f"APPROVE PIPELINE_CHANGE {REPO}#{PR}"])


def check_new_decisions(changed: set[str], bsnap: dict, hsnap: dict) -> None:
    """A registry file added by a PR is checked against its Source comment; changing one is refused."""
    for p in sorted(c for c in changed if c.startswith(DECISIONS_DIR)):
        if p not in hsnap:
            continue        # removing a decision only takes an exemption away
        if p in bsnap:
            fail(f"{p}: a recorded decision cannot be changed, add a new file")
            continue
        fm = re.fullmatch(r"docs/decisions/(\d{4}-\d{2}-\d{2})-[a-z0-9-]+\.md", p)
        if not fm or hsnap[p].startswith(b"symlink:"):
            fail(f"{p}: the registry only holds docs/decisions/YYYY-MM-DD-<slug>.md files")
            continue
        text = hsnap[p].decode("utf-8", "replace")
        parsed = parse_ref(f"{fm.group(1)} {p}")
        if isinstance(parsed, str):
            fail(f"{p}: decision file refused, {parsed}")
            continue
        ddate = parsed[0]
        lines = [ln for ln in text.splitlines() if ln.startswith("APPROVE ")]
        src = re.search(r"^Source: (\S+)$", text, re.MULTILINE)
        problems = []
        if not re.search(rf"^Decision: {re.escape(DECISION_NAME)}$", text, re.MULTILINE):
            problems.append(f"no line 'Decision: {DECISION_NAME}'")
        if not src:
            problems.append("no 'Source: <comment link>' line")
        if not lines:
            problems.append("no APPROVE line")
        for ln in lines:
            m = re.fullmatch(r"APPROVE (COVERAGE_EXEMPT|E2E_EXEMPT|SUPPRESS_EXEMPT) (\S+) until (\d{4}-\d{2}-\d{2})", ln)
            if not m or m.group(2) != REPO:
                problems.append(f"'{ln}' is not 'APPROVE <COVERAGE_EXEMPT|E2E_EXEMPT|SUPPRESS_EXEMPT> {REPO or '<repo>'} until <date>'")
                continue
            try:
                end = dt.date.fromisoformat(m.group(3))
            except ValueError:
                problems.append(f"{m.group(3)} is not a valid date")
                continue
            if (end - ddate).days > EXEMPT_MAX_DAYS or end < ddate:
                problems.append(f"'{ln}' ends more than {EXEMPT_MAX_DAYS} days after the decision")
        if not problems and src:
            why = read_comment(src.group(1), ddate, lines)
            if why:
                problems.append(why)
        for why in problems:
            fail(f"{p}: decision file refused, {why}")


# ---------- thresholds ----------
def compare_threshold(key: str, b: str | None, h: str | None, defaults: dict[str, str], where: str) -> None:
    if key == "FLAKY_RERUNS":
        if (h or "0") != "0":
            fail(f"{where}: FLAKY_RERUNS={h} refused, automatic reruns are not allowed (only 0)")
    elif key == "COVERAGE_MIN":
        d = float(defaults.get(key, "0"))
        bv, hv = num(b, d), num(h, d)
        if hv is None or bv is None:
            fail(f"{where}: {key} unreadable ({b} -> {h})")
        elif hv < bv:
            fail(f"{where}: {key} lowered from {bv:g} to {hv:g}")
    elif key == "DC_FAIL_CVSS":
        d = float(defaults.get(key, "7.0"))
        bv, hv = num(b, d), num(h, d)
        if hv is None or bv is None or hv > bv:
            fail(f"{where}: DC_FAIL_CVSS raised (weaker) from {b or d} to {h or d}")
    elif key == "HADOLINT_THRESHOLD":
        bv, hv = HADOLINT_RANK.get(b or "warning"), HADOLINT_RANK.get(h or "warning")
        if hv is None or bv is None or hv < bv:
            fail(f"{where}: HADOLINT_THRESHOLD lowered from {b or 'warning'} to {h or 'warning'}")
    elif key in ("REQUIRE_DEVICE", "SECRETS_FULL_HISTORY"):
        if (b or "0") == "1" and (h or "0") != "1":
            fail(f"{where}: {key} turned off")
    elif key == "E2E_SPEC" and h and h != b:
        fail(f"{where}: E2E_SPEC narrowed or changed ({b or 'all specs'} -> {h})")


def exemption_problem(e: str, env: dict, base: Path, head: Path) -> str | None:
    """None when env holds a complete exemption e with a valid decision and a valid end date."""
    reason, until, decision = (env.get(f"{e}_{s}", "") for s in ("REASON", "UNTIL", "DECISION"))
    if not reason or not until or not decision:
        return f"needs {e}_REASON, {e}_UNTIL and {e}_DECISION all set"
    try:
        u = dt.date.fromisoformat(until)
    except ValueError:
        return f"{e}_UNTIL={until} is not a valid date"
    why = check_decision(decision, e, base, head, u)
    if why:
        return f"no valid decision from {DECISION_NAME}: {why}"
    d = dt.date.fromisoformat(decision.split()[0])
    if u < today or (u - today).days > EXEMPT_MAX_DAYS or (u - d).days > EXEMPT_MAX_DAYS:
        return f"{e}_UNTIL={until} must be between today and {EXEMPT_MAX_DAYS} days after today and after the decision"
    return None


def check_exemptions(benv: dict, henv: dict, base: Path, head: Path) -> None:
    for e in EXEMPTIONS:
        bt = tuple(benv.get(f"{e}_{s}", "") for s in ("REASON", "UNTIL", "DECISION"))
        ht = tuple(henv.get(f"{e}_{s}", "") for s in ("REASON", "UNTIL", "DECISION"))
        if not any(ht) or ht == bt:
            continue
        label = "added" if not any(bt) else "changed or prolonged"
        why = exemption_problem(e, henv, base, head)
        if why:
            fail(f"{SETTINGS}: {e} {label}: {why}")


def check_suppressions(changed: set[str], bsnap: dict, hsnap: dict, benv: dict, henv: dict, base: Path, head: Path) -> None:
    """F-04: a suppression file added or changed, more inline suppression markers, or another DC_SUPPRESSION."""
    found = []
    dc = {v for v in (benv.get("DC_SUPPRESSION"), henv.get("DC_SUPPRESSION")) if v}
    for p in sorted(changed):
        if p not in hsnap:
            continue        # removing a suppression is stricter
        if p.rsplit("/", 1)[-1] in SUPPRESSION_FILES or p in dc or re.search(r"suppress[^/]*\.xml$", p):
            found.append(f"{p} added or changed")
            continue
        bn = len(SUPPRESSION_MARKERS.findall(bsnap.get(p, b"").decode("utf-8", "replace")))
        hn = len(SUPPRESSION_MARKERS.findall(hsnap[p].decode("utf-8", "replace")))
        if hn > bn:
            found.append(f"{p}: {hn - bn} more inline suppression marker(s)")
    if henv.get("DC_SUPPRESSION") and henv.get("DC_SUPPRESSION") != benv.get("DC_SUPPRESSION"):
        found.append(f"{SETTINGS}: DC_SUPPRESSION set to {henv['DC_SUPPRESSION']}")
    if not found:
        return
    why = exemption_problem("SUPPRESS_EXEMPT", henv, base, head)
    for f in found:
        if why:
            fail(f"suppression without SUPPRESS_EXEMPT: {f} ({why})")
        else:
            warnings.append(f"suppression {f}, accepted by SUPPRESS_EXEMPT until {henv['SUPPRESS_EXEMPT_UNTIL']}")


# ---------- code that runs before or during the pipeline, configuration of what is measured ----------
def package_part(raw: bytes | None, path: str, side: str, structural: list[str]) -> dict | None:
    if raw is None:
        return {}
    if raw.startswith(b"symlink:"):
        structural.append(f"{side} {path} is a symlink")
        return None
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        structural.append(f"{side} {path} is not valid JSON, its npm scripts cannot be compared")
        return None
    if not isinstance(data, dict):
        structural.append(f"{side} {path} is not a JSON object")
        return None
    return {k: data[k] for k in PACKAGE_KEYS if k in data}


def check_run_or_measure(changed: set[str], bsnap: dict, hsnap: dict, structural: list[str]) -> None:
    """F-11: npm lifecycle hooks, .npmrc, setup.py and the like run before the pipeline reads anything.
    V-04: test and coverage configs, npm scripts and .gitattributes decide what the gate measures."""
    for p in sorted(changed):
        name = p.rsplit("/", 1)[-1]
        if name == "package.json":
            b = package_part(bsnap.get(p), p, "base", structural)
            h = package_part(hsnap.get(p), p, "head", structural)
            if b is not None and h is not None and b != h:
                keys = sorted(k for k in b.keys() | h.keys() if b.get(k) != h.get(k))
                structural.append(f"{p}: {', '.join(keys)} changed (npm scripts, install hooks or test and coverage settings)")
        elif runs_or_measures(p) and not trusted(p):
            what = "added" if p not in bsnap else "removed" if p not in hsnap else "changed"
            structural.append(f"{p} {what}: it runs code during the install or decides what the tests measure")
        if p in hsnap and not trusted(p) and not hsnap[p].startswith(b"symlink:"):
            bn = len(REPORT_DIR_RE.findall(bsnap.get(p, b"").decode("utf-8", "replace")))
            hn = len(REPORT_DIR_RE.findall(hsnap[p].decode("utf-8", "replace")))
            if hn > bn:
                structural.append(f"{p}: {hn - bn} more reference(s) to the pipeline report directories (a test could write its own report)")


# ---------- workflows ----------
def norm_ref(uses: str) -> str:
    """owner/repo[/path]@<sha>: only a full commit SHA is blanked, the action itself stays compared (F-03).
    A Dependabot bump changes the SHA (and the version comment) of the same action, nothing else."""
    m = re.fullmatch(r"([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:/[^@\s]+)?)@[0-9a-f]{40}", uses.strip())
    return f"{m.group(1)}@<sha>" if m else uses


def norm_uses(obj):
    """Copy of a workflow fragment with action pins blanked, so Dependabot pin bumps stay allowed."""
    if isinstance(obj, dict):
        return {k: (norm_ref(v) if k == "uses" and isinstance(v, str) else norm_uses(v)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [norm_uses(v) for v in obj]
    return obj


def iter_envs(wf: dict):
    yield "workflow", wf.get("env") or {}
    for jid, job in (wf.get("jobs") or {}).items():
        if isinstance(job, dict):
            yield f"job {jid}", job.get("env") or {}
            for i, st in enumerate(job.get("steps") or []):
                if isinstance(st, dict):
                    yield f"job {jid} step {i + 1}", st.get("env") or {}


def protected_step(st: dict) -> bool:
    run = str(st.get("run") or "")
    with_ = st.get("with") or {}
    return ("test-pipeline.sh" in run or "PIPELINE_BASE_SETTINGS" in run
            or str(with_.get("path", "")) == ".pipeline-base")


def step_key(st: dict) -> str:
    return json.dumps(norm_uses(st), sort_keys=True, default=str)


def workflow_files(snap: dict[str, bytes]) -> list[str]:
    return sorted(p for p in snap if re.fullmatch(r"\.github/workflows/[^/]+\.ya?ml", p))


def check_new_steps(path: str, bwf: dict | None, hwf: dict, structural: list[str]) -> None:
    """F-02: a step added or changed in any workflow is structural; one that touches the settings plumbing
    (PIPELINE_BASE_SETTINGS, an exemption or decision key) fails without exception."""
    bsteps = {step_key(st) for job in ((bwf or {}).get("jobs") or {}).values() if isinstance(job, dict)
              for st in job.get("steps") or [] if isinstance(st, dict)}
    for jid, job in (hwf.get("jobs") or {}).items():
        if not isinstance(job, dict):
            continue
        for i, st in enumerate(job.get("steps") or []):
            if not isinstance(st, dict) or step_key(st) in bsteps:
                continue
            text = json.dumps(st, default=str)
            label = f"{path}: job '{jid}' step {i + 1} ({st.get('name') or str(st.get('run') or st.get('uses'))[:40]})"
            bad = [k for k in ("PIPELINE_BASE_SETTINGS", *sorted(k for k in POLICY_KEYS if "EXEMPT" in k or "DECISION" in k))
                   if re.search(rf"\b{k}\b", text)]
            if bad:
                fail(f"{label} added or changed and touches {', '.join(bad)}: settings and exemptions come from the base copy only")
            elif re.search(r"\bGITHUB_(ENV|PATH)\b", text):
                structural.append(f"{label} added or changed, it writes GITHUB_ENV or GITHUB_PATH")
            else:
                structural.append(f"{label} added or changed")


def check_uses(path: str, wf: dict) -> None:
    """F-03: every action of a workflow is pinned by SHA, and none is a local action that the PR provides."""
    for jid, job in (wf.get("jobs") or {}).items():
        if not isinstance(job, dict):
            continue
        refs = [job["uses"]] if isinstance(job.get("uses"), str) else []
        refs += [st["uses"] for st in job.get("steps") or [] if isinstance(st, dict) and isinstance(st.get("uses"), str)]
        for u in refs:
            if u.startswith(("./", "../")):
                fail(f"{path}: job '{jid}' uses the local action or workflow {u}, which the PR itself can provide")
            elif not u.startswith("docker://") and norm_ref(u) == u:
                fail(f"{path}: job '{jid}' uses {u}, not pinned to a full commit SHA")


def triggers(wf: dict) -> set[str]:
    on = wf.get("on")
    if isinstance(on, str):
        return {on}
    if isinstance(on, list):
        return {str(x) for x in on}
    return {str(k) for k in on} if isinstance(on, dict) else set()


def check_permissions(path: str, wf: dict, side: str) -> None:
    """F-05: no job may write a commit status or a check run, so none can forge "pipeline" or
    "pipeline-config-guard". The guard does not write one either: its verdict is the conclusion of its own
    run, checked by "verify --final". A permissions block is required at the workflow level, otherwise
    the jobs get the repository default token."""
    on = triggers(wf)
    where = f"{side} {path}"
    if "pull_request_target" in on:
        fail(f"{where}: pull_request_target runs with a write token and secrets on PR events, not allowed")
    if "permissions" not in wf:
        fail(f"{where}: no workflow-level permissions block, its jobs would get the repository default token")
    blocks = [("workflow", wf.get("permissions"))] + [
        (f"job '{jid}'", job.get("permissions")) for jid, job in (wf.get("jobs") or {}).items()
        if isinstance(job, dict) and "permissions" in job]
    for label, perms in blocks:
        if isinstance(perms, str) and perms.strip() == "write-all":
            fail(f"{where}: {label} has permissions: write-all")
        elif isinstance(perms, dict):
            for k in FORBIDDEN_WRITES:
                if str(perms.get(k, "")).strip() == "write":
                    fail(f"{where}: {label} has {k}: write, it could post a required check")
        elif perms is not None and not isinstance(perms, str | dict):
            fail(f"{where}: {label} has unreadable permissions")
        elif isinstance(perms, str) and perms.strip() not in ("read-all", "write-all"):
            fail(f"{where}: {label} has unknown permissions {perms!r}")


def homonym(name: str) -> bool:
    n = name.strip().lower()
    return "${{" in n or n in REQUIRED_CHECKS or GUARD_CONTEXT in n


def check_homonyms(path: str, bwf: dict | None, hwf: dict, base_names: set[str]) -> None:
    """F-05, V-10: a new or renamed job, in any workflow, cannot take the name of a required check
    (nor a name computed at run time), and a new workflow cannot take the name of a guarded workflow."""
    if bwf is None and str(hwf.get("name", "")).strip() in base_names:
        fail(f"{path}: new workflow named {hwf.get('name')!r} like an existing one (workflow_run would pick it up)")
    bjobs = (bwf or {}).get("jobs") or {}
    for jid, job in (hwf.get("jobs") or {}).items():
        if not isinstance(job, dict):
            continue
        name = str(job.get("name", jid))
        bjob = bjobs.get(jid)
        if isinstance(bjob, dict) and str(bjob.get("name", jid)) == name:
            continue
        for n in {jid, name}:
            if homonym(n):
                fail(f"{path}: new or renamed job '{jid}' named {n!r}, the name of a required check or computed at run time")


def check_pipeline_wf(bwf: dict | None, hwf: dict | None, defaults: dict[str, str], structural: list[str]) -> None:
    if bwf is None:
        return
    if hwf is None:
        structural.append(f"{PIPELINE_WF} removed or renamed")
        return
    if hwf.get("name") != bwf.get("name"):
        structural.append(f"{PIPELINE_WF}: workflow renamed ({bwf.get('name')} -> {hwf.get('name')})")
    if hwf.get("on") != bwf.get("on"):
        structural.append(f"{PIPELINE_WF}: triggers changed")
    bjobs, hjobs = bwf.get("jobs") or {}, hwf.get("jobs") or {}
    bgate, hgate = bjobs.get(GATE_JOB), hjobs.get(GATE_JOB)
    if bgate is not None:
        if hgate is None:
            structural.append(f"{PIPELINE_WF}: gate job '{GATE_JOB}' removed or renamed")
        else:
            bneeds, hneeds = set(bgate.get("needs") or []), set(hgate.get("needs") or [])
            if not bneeds <= hneeds:
                structural.append(f"{PIPELINE_WF}: gate needs reduced, missing {sorted(bneeds - hneeds)}")
            bg = {k: v for k, v in norm_uses(bgate).items() if k != "needs"}
            hg = {k: v for k, v in norm_uses(hgate).items() if k != "needs"}
            if bg != hg:
                structural.append(f"{PIPELINE_WF}: gate job '{GATE_JOB}' changed (name, condition or steps)")
    for jid, bjob in bjobs.items():
        hjob = hjobs.get(jid)
        if hjob is None:
            structural.append(f"{PIPELINE_WF}: job '{jid}' removed or renamed")
            continue
        if hjob.get("if") != bjob.get("if"):
            structural.append(f"{PIPELINE_WF}: condition of job '{jid}' changed")
        if hjob.get("name") != bjob.get("name"):
            structural.append(f"{PIPELINE_WF}: job '{jid}' renamed")
        hsteps = [norm_uses(s) for s in hjob.get("steps") or [] if isinstance(s, dict)]
        for st in bjob.get("steps") or []:
            if isinstance(st, dict) and protected_step(st) and norm_uses(st) not in hsteps:
                label = st.get("name") or str(st.get("run", ""))[:40]
                structural.append(f"{PIPELINE_WF}: protected step '{label}' of job '{jid}' changed or removed")
    # every job of the head, new ones included
    for jid, hjob in hjobs.items():
        if not isinstance(hjob, dict):
            continue
        items = [("job", hjob)] + [("step", s) for s in hjob.get("steps") or [] if isinstance(s, dict)]
        for kind, it in items:
            coe = it.get("continue-on-error")
            if coe not in (None, False, "false"):
                fail(f"{PIPELINE_WF}: continue-on-error on a {kind} of job '{jid}'")
            if str(it.get("if", "")).strip() in FALSE_IFS:
                fail(f"{PIPELINE_WF}: constant false condition on a {kind} of job '{jid}'")
    # policy keys and PIPELINE_BASE_SETTINGS in the workflow env
    benv = {(loc, k): str(v) for loc, env in iter_envs(bwf) for k, v in env.items()}
    for loc, env in iter_envs(hwf):
        for k, v in env.items():
            v = str(v)
            if k == "PIPELINE_BASE_SETTINGS":
                fail(f"{PIPELINE_WF}: PIPELINE_BASE_SETTINGS set in the env of {loc}, only the base settings step may set it")
            elif k in ("COVERAGE_MIN", "FLAKY_RERUNS", "DC_FAIL_CVSS", "HADOLINT_THRESHOLD", "REQUIRE_DEVICE",
                       "SECRETS_FULL_HISTORY", "E2E_SPEC", "DC_SUPPRESSION"):
                compare_threshold(k, benv.get((loc, k)), v, defaults, f"{PIPELINE_WF} env of {loc}")
            elif k in POLICY_KEYS and benv.get((loc, k)) != v:
                fail(f"{PIPELINE_WF}: {k} set in the env of {loc}, exemptions belong in {SETTINGS} with a decision")
            elif k in SCRIPT_FLOORS and SCRIPT_FLOORS[k] and (loc, k) in benv:
                bv, hv = num(benv[(loc, k)], 0), num(v, 0)
                if bv is None or hv is None or (hv - bv) * SCRIPT_FLOORS[k] < 0:
                    fail(f"{PIPELINE_WF}: floor {k} weakened in the env of {loc} ({benv[(loc, k)]} -> {v})")


# ---------- fetch: the PR files through the API, for the workflow_run guard (F-06, F-10, F-05) ----------
MAX_CHANGED = 3000      # above this the guard fails closed instead of reading a partial PR
MAX_FETCH = 6000


class GuardError(Exception):
    pass


def gh_api(endpoint: str, raw: bool = False) -> bytes:
    cmd = ["gh", "api"] + (["-H", "Accept: application/vnd.github.raw+json"] if raw else []) + [endpoint]
    try:
        return subprocess.run(cmd, check=True, capture_output=True).stdout
    except (OSError, subprocess.CalledProcessError) as e:
        err = getattr(e, "stderr", b"") or b""
        raise GuardError(f"API call {endpoint} failed: {err.decode('utf-8', 'replace').strip() or e}") from e


def gh_json(endpoint: str):
    try:
        return json.loads(gh_api(endpoint))
    except json.JSONDecodeError as e:
        raise GuardError(f"API call {endpoint} returned no JSON") from e


def workflow_identity(repo: str, path: str) -> int:
    """workflow_id of a workflow file, as the API knows it on the default branch."""
    name = path.rsplit("/", 1)[-1]
    return gh_json(f"repos/{repo}/actions/workflows/{name}")["id"]


def check_run_origin(run: dict, repo: str, path: str, event: str) -> None:
    """The run must come from that workflow file, not from a homonym (same name, other file)."""
    if run.get("path") != path:
        raise GuardError(f"run {run.get('id')} comes from {run.get('path')}, not {path} (homonym workflow)")
    if run.get("workflow_id") != workflow_identity(repo, path):
        raise GuardError(f"run {run.get('id')} has workflow_id {run.get('workflow_id')}, not the one of {path}")
    if run.get("event") != event:
        raise GuardError(f"run {run.get('id')} was triggered by {run.get('event')}, not {event}")


def tree(repo: str, sha: str) -> dict[str, dict]:
    t = gh_json(f"repos/{repo}/git/trees/{sha}?recursive=1")
    if t.get("truncated"):
        raise GuardError(f"the tree of {sha} is too large for the API (truncated), the guard fails closed")
    out = {}
    for e in t.get("tree", []):
        if e.get("type") == "tree":
            continue
        p = e["path"]
        parts = p.split("/")
        if "\n" in p or "\r" in p or p.startswith("/") or any(x in ("", ".", "..") for x in parts):
            raise GuardError(f"unexpected path in the tree of {sha}: {p!r}")
        out[p] = e
    return out


def wanted(path: str) -> bool:
    return (trusted(path) or path == SETTINGS or path.startswith(DECISIONS_DIR)
            or path.rsplit("/", 1)[-1] in SUPPRESSION_FILES)


def fetch_main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(prog="pipeline-guard.py fetch")
    ap.add_argument("--repo", required=True)
    ap.add_argument("--run-id", required=True, help="id of the test-pipeline run the guard evaluates")
    ap.add_argument("--head-sha", required=True, help="head_sha of the workflow_run event")
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    out = Path(args.out)
    try:
        repo = args.repo
        run = gh_json(f"repos/{repo}/actions/runs/{args.run_id}")
        check_run_origin(run, repo, PIPELINE_WF, "pull_request")
        if run.get("head_sha") != args.head_sha:
            raise GuardError(f"run {args.run_id} is for {run.get('head_sha')}, not {args.head_sha}")
        prs = run.get("pull_requests") or []
        if len(prs) != 1:
            raise GuardError(f"run {args.run_id} has {len(prs)} pull requests attached, expected exactly 1 "
                             "(pull requests from forks are not supported)")
        number = prs[0]["number"]
        pr = gh_json(f"repos/{repo}/pulls/{number}")
        default = gh_json(f"repos/{repo}")["default_branch"]
        if pr.get("state") != "open":
            raise GuardError(f"PR #{number} is not open")
        if pr["head"]["sha"] != args.head_sha:
            raise GuardError(f"PR #{number} head is {pr['head']['sha']}, not {args.head_sha}")
        if pr["base"]["ref"] != default:
            raise GuardError(f"PR #{number} targets {pr['base']['ref']}, not the default branch {default}")
        if pr["base"]["repo"]["full_name"] != repo:
            raise GuardError(f"PR #{number} targets another repository")
        base_sha = pr["base"]["sha"]
        trees = {"base": tree(repo, base_sha), "head": tree(repo, args.head_sha)}
        changed = sorted(p for p in trees["base"].keys() | trees["head"].keys()
                         if (trees["base"].get(p) or {}).get("sha") != (trees["head"].get(p) or {}).get("sha")
                         or (trees["base"].get(p) or {}).get("mode") != (trees["head"].get(p) or {}).get("mode"))
        if len(changed) > MAX_CHANGED:
            raise GuardError(f"{len(changed)} changed files, more than {MAX_CHANGED}: the guard fails closed")
        fetched = 0
        for side, entries in trees.items():
            root = out / side
            root.mkdir(parents=True, exist_ok=True)
            for p, e in sorted(entries.items()):
                if p not in changed and not wanted(p):
                    continue
                fetched += 1
                if fetched > MAX_FETCH:
                    raise GuardError(f"more than {MAX_FETCH} files to read: the guard fails closed")
                dest = root / p
                dest.parent.mkdir(parents=True, exist_ok=True)
                if e.get("type") == "commit":
                    dest.write_text(f"submodule {e['sha']}\n", encoding="utf-8")
                    continue
                data = gh_api(f"repos/{repo}/git/blobs/{e['sha']}", raw=True)
                if e.get("mode") == "120000":
                    os.symlink(data.decode("utf-8", "surrogateescape"), dest)
                else:
                    dest.write_bytes(data)
        (out / "changed.txt").write_text("".join(f"{p}\n" for p in changed), encoding="utf-8")
        (out / "pr.env").write_text(f"PR={number}\nBASE_SHA={base_sha}\n", encoding="utf-8")
    except (GuardError, KeyError, TypeError) as e:
        print(f"pipeline-guard fetch: {e}", file=sys.stderr)
        return 1
    print(f"PR #{number}, base {base_sha}, head {args.head_sha}, {len(changed)} changed files, {fetched} read")
    return 0


# ---------- verify: who wrote the verdicts of a commit (F-05) ----------
def run_of(url: str, repo: str) -> str | None:
    m = re.fullmatch(rf"https://github\.com/{re.escape(repo)}/actions/runs/(\d+)(/job/\d+)?", url or "")
    return m.group(1) if m else None


def guard_runs(repo: str, sha: str) -> list[dict]:
    """Runs of the guard file on workflow_run for sha, newest first. Only the default branch copy of the
    guard runs on workflow_run, so its run-name cannot be chosen by a PR."""
    wid = workflow_identity(repo, GUARD_WF)
    runs = gh_json(f"repos/{repo}/actions/workflows/{wid}/runs?event=workflow_run&per_page=100").get("workflow_runs", [])
    out = []
    for r in runs:
        m = re.fullmatch(rf"{GUARD_CONTEXT} ([0-9a-f]{{40}}) (\d+)", str(r.get("display_title") or ""))
        if m and m.group(1) == sha:
            check_run_origin(r, repo, GUARD_WF, "workflow_run")
            out.append(dict(r, pipeline_run=m.group(2)))
    return sorted(out, key=lambda r: (str(r.get("created_at") or ""), int(r.get("id") or 0)), reverse=True)


def verify_main(argv: list[str]) -> int:
    """No pipeline-config-guard status may exist (the guard writes none), every "pipeline" check run must
    link to a run of test-pipeline.yml. With --final, the latest guard run for SHA must have succeeded on a
    pipeline run of that SHA, and a pipeline check run must have succeeded: DevScribe runs it before merging."""
    ap = argparse.ArgumentParser(prog="pipeline-guard.py verify")
    ap.add_argument("--repo", required=True)
    ap.add_argument("--sha", required=True)
    ap.add_argument("--final", action="store_true")
    args = ap.parse_args(argv)
    repo, problems, gruns = args.repo, [], []
    try:
        if not re.fullmatch(r"[0-9a-f]{40}", args.sha):
            raise GuardError(f"{args.sha} is not a full commit SHA")
        statuses = [st for st in gh_json(f"repos/{repo}/commits/{args.sha}/statuses?per_page=100")
                    if st.get("context") == GUARD_CONTEXT]
        checks = [c for c in gh_json(f"repos/{repo}/commits/{args.sha}/check-runs?per_page=100")
                  .get("check_runs", []) if c.get("name") == GATE_JOB]
        seen: dict[str, str | None] = {}

        def origin(rid: str | None, url: str, path: str, event: str) -> str | None:
            if rid is None:
                return f"links to {url or 'nothing'}, not to a run of {path}"
            if rid not in seen:
                try:
                    run = gh_json(f"repos/{repo}/actions/runs/{rid}")
                    check_run_origin(run, repo, path, event)
                    seen[rid] = None if run.get("head_sha") == args.sha else f"run {rid} is for {run.get('head_sha')}"
                except GuardError as e:
                    seen[rid] = str(e)
            return seen[rid]

        for st in statuses:
            problems.append(f"{GUARD_CONTEXT} commit status ({st.get('state')}, {st.get('created_at')}, "
                            f"{st.get('target_url')}): the guard writes no status, this one is forged")
        for c in checks:
            if (c.get("app") or {}).get("slug") != "github-actions":
                problems.append(f"check run '{GATE_JOB}' {c.get('id')} was written by {(c.get('app') or {}).get('slug')}")
                continue
            why = origin(run_of(c.get("details_url"), repo), c.get("details_url"), PIPELINE_WF, "pull_request")
            if why:
                problems.append(f"check run '{GATE_JOB}' {c.get('id')}: {why}")
        if args.final:
            gruns = guard_runs(repo, args.sha)
            if not gruns:
                problems.append(f"no {GUARD_CONTEXT} run for {args.sha}")
            else:
                last = gruns[0]
                if last.get("status") != "completed" or last.get("conclusion") != "success":
                    problems.append(f"latest {GUARD_CONTEXT} run {last.get('id')} is {last.get('status')}/"
                                    f"{last.get('conclusion')}, not completed/success")
                why = origin(last["pipeline_run"], "", PIPELINE_WF, "pull_request")
                if why:
                    problems.append(f"latest {GUARD_CONTEXT} run {last.get('id')} judged run {last['pipeline_run']}: {why}")
            if not any(c.get("conclusion") == "success" for c in checks):
                problems.append(f"no successful '{GATE_JOB}' check run")
    except (GuardError, KeyError, TypeError, AttributeError, ValueError) as e:
        problems.append(str(e))
    for why in problems:
        print(f"FAIL  {why}", file=sys.stderr)
    if problems:
        return 1
    print(f"verified: {len(gruns)} {GUARD_CONTEXT} runs, 0 statuses and {len(checks)} pipeline check runs "
          "from the expected workflows")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="pipeline-config-guard", usage=__doc__)
    ap.add_argument("base")
    ap.add_argument("head")
    ap.add_argument("--changed", help="file with the paths the PR changes (one per line), from the git trees")
    ap.add_argument("--repo", default="", help="owner/name of the repository")
    ap.add_argument("--pr", default="", help="number of the pull request")
    args = ap.parse_args()
    global REPO, PR
    REPO, PR = args.repo, args.pr
    base, head = Path(args.base), Path(args.head)
    if not base.is_dir() or not head.is_dir():
        print("pipeline-guard: BASE_DIR and HEAD_DIR must be directories", file=sys.stderr)
        return 2
    bsnap, hsnap = snapshot(base), snapshot(head)
    changed = {p for p in bsnap.keys() | hsnap.keys() if bsnap.get(p) != hsnap.get(p)}
    if args.changed:
        changed |= {ln.strip() for ln in Path(args.changed).read_text(encoding="utf-8").splitlines() if ln.strip()}
    bguard = load_yaml(read(base, GUARD_WF), f"base {GUARD_WF}")
    bpipe = load_yaml(read(base, PIPELINE_WF), f"base {PIPELINE_WF}")
    hguard = load_yaml(read(head, GUARD_WF), f"head {GUARD_WF}")
    hpipe = load_yaml(read(head, PIPELINE_WF), f"head {PIPELINE_WF}")
    try:
        benv, henv = parse_env(read_settings(base)), parse_env(read_settings(head))
    except ValueError as e:
        fail(str(e))
        benv, henv = {}, {}
    bfloors, hfloors = parse_floors(read(base, SCRIPT)), parse_floors(read(head, SCRIPT))
    # F-06: no bootstrap mode. The guard runs from the default branch, so a base without the pipeline
    # is not the default branch (or a broken one): nothing to compare with, nothing is accepted.
    if bguard is None or bpipe is None:
        fail(f"the base has no {PIPELINE_WF} or {GUARD_WF}: a PR is only checked against a base with the pipeline")

    global EXTRA_TRUSTED
    EXTRA_TRUSTED = tuple(benv.get("PIPELINE_TRUSTED_PATHS", "").split())
    dropped = sorted(set(EXTRA_TRUSTED) - set(henv.get("PIPELINE_TRUSTED_PATHS", "").split()))
    defaults = {"COVERAGE_MIN": bfloors.get("COVERAGE_FLOOR", "80"), "DC_FAIL_CVSS": bfloors.get("DC_CVSS_CEILING", "7.0")}
    # 1. thresholds in the settings file, a raise is fine
    for k in THRESHOLD_KEYS:
        compare_threshold(k, benv.get(k), henv.get(k), defaults, SETTINGS)
    # 2. floors of the script
    if bfloors and read(head, SCRIPT) is None:
        fail(f"{SCRIPT} removed or renamed")
    for k, sign in SCRIPT_FLOORS.items():
        if k not in bfloors:
            continue
        bv, hv = bfloors[k], hfloors.get(k)
        if hv is None:
            fail(f"{SCRIPT}: floor {k} removed")
        elif sign == 0:
            if hv != bv:
                fail(f"{SCRIPT}: {k} changed ({bv} -> {hv})")
        else:
            b, h = num(bv, 0), num(hv, 0)
            if b is None or h is None or (h - b) * sign < 0:
                fail(f"{SCRIPT}: floor {k} weakened ({bv} -> {hv})")
    # 3. exemptions and suppressions need a decision
    check_exemptions(benv, henv, base, head)
    check_suppressions(changed, bsnap, hsnap, benv, henv, base, head)
    check_new_decisions(changed, bsnap, hsnap)
    # 4. structure of the gate, the guard and the triggers
    structural: list[str] = []
    if dropped:
        structural.append(f"{SETTINGS}: PIPELINE_TRUSTED_PATHS no longer lists {' '.join(dropped)}")
    # 4a. other settings (commands, tasks, runner): they apply once merged, so a change is structural (F-07)
    for k in sorted((benv.keys() | henv.keys()) - set(THRESHOLD_KEYS) - set(POLICY_KEYS)):
        if benv.get(k) != henv.get(k):
            structural.append(f"{SETTINGS}: {k} changed ({benv.get(k)!r} -> {henv.get(k)!r}), it decides what a stage runs")
    # 4b. allowlist: anything that runs or configures the pipeline (F-01, F-02)
    bwfs = {p: load_yaml(read(base, p), f"base {p}") for p in workflow_files(bsnap)}
    hwfs = {p: load_yaml(read(head, p), f"head {p}") for p in workflow_files(hsnap)}
    base_names = {str(wf.get("name", "")).strip() for wf in bwfs.values() if wf}
    for p, wf in hwfs.items():
        if wf is not None:
            check_uses(p, wf)
            check_permissions(p, wf, "head")
            check_homonyms(p, bwfs.get(p), wf, base_names)
    for p, wf in bwfs.items():
        if wf is not None and triggers(wf) & {"pull_request", "pull_request_target"}:
            check_permissions(p, wf, "base")
    for p in sorted(changed):
        if not trusted(p):
            continue
        if p in hwfs and p in bwfs and hwfs[p] is not None and bwfs[p] is not None:
            if norm_uses(hwfs[p]) == norm_uses(bwfs[p]):
                warnings.append(f"{p}: action pins changed only")
                continue
            check_new_steps(p, bwfs[p], hwfs[p], structural)
            structural.append(f"{p} changed")
        elif p in hwfs and p not in bwfs:
            if hwfs[p] is not None:
                check_new_steps(p, None, hwfs[p], structural)
            structural.append(f"{p}: new workflow")
        elif p not in hsnap:
            structural.append(f"{p} removed")
        elif p not in bsnap:
            structural.append(f"{p} added")
        else:
            structural.append(f"{p} changed")
    check_run_or_measure(changed, bsnap, hsnap, structural)
    check_pipeline_wf(bpipe, hpipe, defaults, structural)
    if bguard is not None:
        if hguard is None:
            structural.append(f"{GUARD_WF} removed or renamed")
        elif norm_uses(hguard) != norm_uses(bguard):
            structural.append(f"{GUARD_WF}: guard workflow changed (triggers, conditions, jobs or steps)")
    bscript, hscript = read(base, GUARD_SCRIPT), read(head, GUARD_SCRIPT)
    if bscript is not None and hscript != bscript:
        structural.append(f"{GUARD_SCRIPT} changed or removed")
    if structural:
        ref = henv.get("PIPELINE_CHANGE_DECISION", "")
        why = check_change_decision(ref) if ref else "no PIPELINE_CHANGE_DECISION"
        if why:
            errors.extend(f"{s} (needs a decision from {DECISION_NAME}: {why})" for s in structural)
        else:
            warnings.extend(f"{s}, accepted by PIPELINE_CHANGE_DECISION {ref}" for s in structural)
    for w in warnings:
        print(f"warning: {w}")
    for e in errors:
        print(f"error: {e}")
    if errors:
        print(f"pipeline-guard: FAIL, {len(errors)} violation(s)")
        return 1
    print("pipeline-guard: PASS")
    return 0


if __name__ == "__main__":
    if sys.argv[1:2] == ["fetch"]:
        sys.exit(fetch_main(sys.argv[2:]))
    if sys.argv[1:2] == ["verify"]:
        sys.exit(verify_main(sys.argv[2:]))
    sys.exit(main())

#!/usr/bin/env python3
"""Fails when a database password or a published Postgres port comes back into the repository.

Usage: scripts/security/check-db-credentials.py [directory]   (default: the current directory)

Scans the files git tracks plus the untracked ones it does not ignore (every file when the
directory is not a git repository) and reports, without ever printing a password:
  - a literal value for POSTGRES_PASSWORD or PGPASSWORD (only a variable reference is allowed,
    with no default value: ${VAR}, ${VAR:?message}, $VAR)
  - a literal value for DATABASE_URL or TEST_DATABASE_URL
  - any postgres:// or postgresql:// URL that carries a literal password, and says so when the
    password is trivial (same as the user, postgres, password, changeme...)
  - in a compose file, POSTGRES_PASSWORD not required with ${VAR:?message}
  - port 5432 published in a base compose file, or published on anything else than 127.0.0.1 in
    a compose override, a workflow or a docker run command

Exit codes: 0 clean, 1 findings, 2 usage error. Part of the security stage of
scripts/test-pipeline.sh (check "credentials"), see GH-01 in the GitHub security audit.
"""
import os
import re
import subprocess
import sys

TRIVIAL = {"postgres", "password", "passw0rd", "changeme", "change_me", "secret", "admin",
           "root", "test", "example", "123456", "taskora"}
SKIP_SUFFIXES = (".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".pdf", ".zip", ".gz",
                 ".tgz", ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".svg", ".lock")
SKIP_NAMES = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml"}
SKIP_DIRS = ("node_modules/", "test-results/", ".git/", "dist/", "coverage/")

PASSWORD_VAR = re.compile(r"""(?<!\$\{)(?<!\$)\b(?P<key>POSTGRES_PASSWORD|PGPASSWORD)\b["']?\s*[:=]\s*(?P<val>"[^"]*"|'[^']*'|\$\{[^}]*\}|[^\s#,;)]*)""")
URL_VAR = re.compile(r"""(?<!\$\{)(?<!\$)\b(?P<key>(?:TEST_)?DATABASE_URL)\b["']?\s*[:=]\s*(?P<val>"[^"]*"|'[^']*'|`[^`]*`|(?:\$\{[^}]*\}|[^\s#,;)$]|\$(?!\{))*)""")
PG_URL = re.compile(r"""postgres(?:ql)?://(?P<user>[^:@/\s"'`]*):(?P<pw>(?:\$\{[^}]*\}|[^@\s"'`$]|\$(?!\{))*)@""")
PUBLISH_FLAG = re.compile(r"""(?:^|\s)(?:-p|--publish)(?:\s+|=)["']?(?P<spec>[^\s"']+)""")
SHORT_PORT = re.compile(r"""^\s*-\s*["']?(?P<spec>[^\s"'#]+)["']?\s*(?:#.*)?$""")
TARGET_PORT = re.compile(r"""^(?P<indent>\s*)(?:-\s*)?target:\s*["']?5432["']?\s*$""")
COMPOSE_NAME = re.compile(r"""^(?:docker-)?compose(?:\.[\w.-]+)?\.ya?ml$""")


def files_to_scan(root):
    try:
        out = subprocess.run(["git", "-C", root, "ls-files", "-z", "--cached", "--others",
                              "--exclude-standard"], capture_output=True, check=True).stdout
        names = [n.decode() for n in out.split(b"\0") if n]
    except (OSError, subprocess.CalledProcessError):
        names = []
        for d, dirs, fs in os.walk(root):
            dirs[:] = [x for x in dirs if x not in (".git", "node_modules")]
            names += [os.path.relpath(os.path.join(d, f), root) for f in fs]
    keep = []
    for n in sorted(set(names)):
        base = os.path.basename(n)
        if base in SKIP_NAMES or n.lower().endswith(SKIP_SUFFIXES):
            continue
        if any(n.startswith(d) or ("/" + d) in n for d in SKIP_DIRS):
            continue
        if os.path.isfile(os.path.join(root, n)):
            keep.append(n)
    return keep


def unquote(v):
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'`":
        v = v[1:-1]
    return v


def is_reference(v):
    """A variable reference with no default value: ${VAR}, ${VAR:?msg}, ${{ expr }}, $VAR."""
    if re.fullmatch(r"\$\{\{[^}]*\}\}", v):
        return True
    if re.fullmatch(r"\$[A-Za-z_][A-Za-z0-9_]*", v):
        return True
    m = re.fullmatch(r"\$\{[A-Za-z_][A-Za-z0-9_]*(?P<op>:?[?]?)(?P<rest>.*)\}", v)
    if not m:
        return False
    return m.group("rest") == "" or m.group("op") in (":?", "?")


def password_finding(user, pw):
    if pw == "" or is_reference(pw) or pw == "***":
        return None
    if pw.lower() == user.lower() and user:
        return "trivial password, the same as the user"
    if pw.lower() in TRIVIAL:
        return "trivial default password"
    return "literal password"


def check_port_spec(spec, base_compose):
    """spec like [ip:]host:container[/proto]. Returns a message or None."""
    spec = spec.split("/")[0]
    parts = spec.rsplit(":", 2) if not spec.startswith("[") else None
    if parts is None or len(parts) < 2:
        return None
    container = parts[-1]
    if not re.fullmatch(r"\d+(-\d+)?", container):
        return None
    lo, _, hi = container.partition("-")
    if not (int(lo) <= 5432 <= int(hi or lo)):
        return None
    ip = parts[0] if len(parts) == 3 else ""
    if base_compose:
        return "port 5432 published in the base compose file, use a separate dev override on 127.0.0.1"
    if ip != "127.0.0.1":
        return "port 5432 published on " + (ip or "every interface") + ", only 127.0.0.1 is allowed"
    return None


def scan_file(root, rel):
    path = os.path.join(root, rel)
    try:
        with open(path, "rb") as fh:
            raw = fh.read()
    except OSError:
        return []
    if b"\0" in raw[:4096]:
        return []
    text = raw.decode("utf-8", errors="replace")
    lines = text.splitlines()
    base = os.path.basename(rel)
    is_compose = bool(COMPOSE_NAME.match(base))
    base_compose = is_compose and not re.search(r"override|\.dev\.|\.local\.", base)
    is_workflow = rel.startswith(".github/workflows/") and base.endswith((".yml", ".yaml"))
    findings = []

    def add(n, msg):
        findings.append("%s:%d: %s" % (rel, n, msg))

    for n, line in enumerate(lines, 1):
        for m in PASSWORD_VAR.finditer(line):
            v = unquote(m.group("val"))
            if v == "" and not is_compose:
                continue
            if not is_reference(v):
                add(n, m.group("key") + ": literal or defaulted value, pass it from the environment or a secret")
            elif is_compose and m.group("key") == "POSTGRES_PASSWORD" and ":?" not in v:
                add(n, "POSTGRES_PASSWORD must be a required variable in compose, with the :? form")
        for m in URL_VAR.finditer(line):
            v = unquote(m.group("val"))
            if re.match(r"[a-z][a-z0-9+.-]*://", v):
                u = PG_URL.match(v)
                if not u or password_finding(u.group("user"), u.group("pw")):
                    add(n, m.group("key") + ": literal URL, build it from the password variable")
        for m in PG_URL.finditer(line):
            why = password_finding(m.group("user"), m.group("pw"))
            if why:
                add(n, "postgres URL with a " + why)
        for m in PUBLISH_FLAG.finditer(line):
            why = check_port_spec(m.group("spec"), False)
            if why:
                add(n, why)
        if is_compose or is_workflow:
            m = SHORT_PORT.match(line)
            if m and ":" in m.group("spec"):
                why = check_port_spec(m.group("spec"), base_compose)
                if why:
                    add(n, why)
            m = TARGET_PORT.match(line)
            if m:
                # long syntax: look for host_ip in the same list item
                block = "\n".join(lines[max(0, n - 6):n + 5])
                if base_compose:
                    add(n, "port 5432 published in the base compose file, use a separate dev override on 127.0.0.1")
                elif not re.search(r"host_ip:\s*[\"']?127\.0\.0\.1", block):
                    add(n, "port 5432 published without host_ip: 127.0.0.1")
    return findings


def main(argv):
    if len(argv) > 2:
        print(__doc__.strip().splitlines()[2], file=sys.stderr)
        return 2
    root = os.path.abspath(argv[1] if len(argv) == 2 else ".")
    if not os.path.isdir(root):
        print("not a directory: " + root, file=sys.stderr)
        return 2
    findings = []
    files = files_to_scan(root)
    for rel in files:
        findings += scan_file(root, rel)
    for f in findings:
        print(f)
    if findings:
        print("%d database credential finding(s) in %d file(s) scanned" % (len(findings), len(files)), file=sys.stderr)
        return 1
    print("no database credential finding in %d file(s)" % len(files))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

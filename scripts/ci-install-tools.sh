#!/usr/bin/env bash
# ci-install-tools.sh: download pinned security tools and check their SHA-256 before use.
#
# Usage: scripts/ci-install-tools.sh <tool>...
#   tools: gitleaks osv-scanner hadolint actionlint trivy
# TOOLS_DIR    where binaries go (default: $RUNNER_TEMP/tools/bin in GitHub Actions, ./.tools/bin otherwise)
#
# To bump a tool, change its version and checksum together. Take the checksum from the
# checksums file published with the release and check it against the downloaded asset.
# Linux x86_64 only.
set -euo pipefail

GITLEAKS_VERSION=8.30.1
GITLEAKS_SHA256=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb  # gitleaks_8.30.1_linux_x64.tar.gz
OSV_SCANNER_VERSION=2.7.0
OSV_SCANNER_SHA256=160c6253e2922e9e0a6a9771c5c4c40a4b3c6090b34a3cdd5e80c96cc2e4218b  # osv-scanner_linux_amd64
HADOLINT_VERSION=2.15.1
HADOLINT_SHA256=c7187db94eeeeca956519a6af171adc31453941a1e777961f6e680f697c8c507  # hadolint-linux-x86_64
ACTIONLINT_VERSION=1.7.12
ACTIONLINT_SHA256=8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8  # actionlint_1.7.12_linux_amd64.tar.gz
# checksums file of the release verified with cosign (sigstore bundle, aquasecurity/trivy release workflow)
TRIVY_VERSION=0.75.0
TRIVY_SHA256=c6e65abddb348e25f10549df887045629cf28cc72453cd1c63acb717316b3f3f  # trivy_0.75.0_Linux-64bit.tar.gz

if [[ -n "${RUNNER_TEMP:-}" ]]; then
  TOOLS_DIR="${TOOLS_DIR:-$RUNNER_TEMP/tools/bin}"
else
  TOOLS_DIR="${TOOLS_DIR:-$PWD/.tools/bin}"
fi

die() { printf 'ci-install-tools: %s\n' "$*" >&2; exit 1; }

[[ $# -gt 0 ]] || die "usage: $0 <gitleaks|osv-scanner|hadolint|actionlint|trivy>..."
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || die "only Linux x86_64 is supported"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$TOOLS_DIR"

fetch() { # $1 url, $2 expected sha256, $3 output file
  curl -fsSL --proto '=https' --tlsv1.2 --retry 3 -o "$3" "$1"
  printf '%s  %s\n' "$2" "$3" | sha256sum --check --quiet - || die "checksum mismatch for $1"
}

for tool in "$@"; do
  case "$tool" in
    gitleaks)
      fetch "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
        "$GITLEAKS_SHA256" "$WORK/gitleaks.tar.gz"
      tar -xzf "$WORK/gitleaks.tar.gz" -C "$WORK" gitleaks
      install -m 0755 "$WORK/gitleaks" "$TOOLS_DIR/gitleaks"
      ;;
    osv-scanner)
      fetch "https://github.com/google/osv-scanner/releases/download/v${OSV_SCANNER_VERSION}/osv-scanner_linux_amd64" \
        "$OSV_SCANNER_SHA256" "$WORK/osv-scanner"
      install -m 0755 "$WORK/osv-scanner" "$TOOLS_DIR/osv-scanner"
      ;;
    hadolint)
      fetch "https://github.com/hadolint/hadolint/releases/download/v${HADOLINT_VERSION}/hadolint-linux-x86_64" \
        "$HADOLINT_SHA256" "$WORK/hadolint"
      install -m 0755 "$WORK/hadolint" "$TOOLS_DIR/hadolint"
      ;;
    actionlint)
      fetch "https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz" \
        "$ACTIONLINT_SHA256" "$WORK/actionlint.tar.gz"
      tar -xzf "$WORK/actionlint.tar.gz" -C "$WORK" actionlint
      install -m 0755 "$WORK/actionlint" "$TOOLS_DIR/actionlint"
      ;;
    trivy)
      fetch "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" \
        "$TRIVY_SHA256" "$WORK/trivy.tar.gz"
      tar -xzf "$WORK/trivy.tar.gz" -C "$WORK" trivy
      install -m 0755 "$WORK/trivy" "$TOOLS_DIR/trivy"
      ;;
    *) die "unknown tool: $tool" ;;
  esac
  printf 'installed %s in %s\n' "$tool" "$TOOLS_DIR"
done

if [[ -n "${GITHUB_PATH:-}" ]]; then
  printf '%s\n' "$TOOLS_DIR" >>"$GITHUB_PATH"
fi

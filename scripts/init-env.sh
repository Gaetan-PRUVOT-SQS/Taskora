#!/usr/bin/env bash
# Writes the secrets docker compose needs into .env (ignored by git), once per machine:
# a random POSTGRES_PASSWORD and a random JWT_SECRET. Values already set in .env are kept.
#   scripts/init-env.sh            create or complete .env at the repository root
#   ENV_FILE=path scripts/init-env.sh
# The file is created with mode 600. Nothing is printed except the names of the keys added.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"

rand_hex() { od -An -tx1 -N"$1" /dev/urandom | tr -d ' \n'; }
has_value() { grep -Eq "^$1=.+" "$ENV_FILE"; }

umask 077
if [[ ! -e "$ENV_FILE" ]]; then
  : >"$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

added=()
set_random() { # set_random <key> <bytes>: replace an empty or missing key with random hex
  local key="$1"
  has_value "$key" && return 0
  sed -i "/^${key}=/d" "$ENV_FILE"
  printf '%s=%s\n' "$key" "$(rand_hex "$2")" >>"$ENV_FILE"
  added+=("$key")
}
# hex only: the password also goes into DATABASE_URL, where it needs no escaping
set_random POSTGRES_PASSWORD 32
set_random JWT_SECRET 48

if [[ ${#added[@]} -gt 0 ]]; then
  echo "added to $ENV_FILE: ${added[*]}"
else
  echo "$ENV_FILE already has POSTGRES_PASSWORD and JWT_SECRET, nothing changed"
fi

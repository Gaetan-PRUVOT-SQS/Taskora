#!/usr/bin/env bash
# Throwaway PostgreSQL 16 for the tests, in Docker, data kept in tmpfs, bound to 127.0.0.1 only.
#   scripts/test-db.sh start   start (or reuse) the container, print its URL on stdout
#   scripts/test-db.sh stop    remove the container
# The password is random for each new container (or TEST_DB_PASSWORD when the caller sets it,
# the CI does and masks it). The tests then create one database per test file on this server.
set -euo pipefail

NAME="${TEST_DB_CONTAINER:-taskora-test-pg}"
PORT="${TEST_DB_PORT:-55432}"
# same image as docker-compose.yml, checked by the policy job
IMAGE="${TEST_DB_IMAGE:-postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea}"

case "${1:-}" in
  start)
    if ! docker info >/dev/null 2>&1; then
      echo "docker is not available" >&2
      exit 1
    fi
    if [[ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null || true)" == "true" ]]; then
      # reuse: read back the password this container was started with
      password="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$NAME" | sed -n 's/^POSTGRES_PASSWORD[=]//p')"
      if [[ -z "$password" ]]; then
        echo "container $NAME runs without POSTGRES_PASSWORD, remove it with: $0 stop" >&2
        exit 1
      fi
    else
      docker rm -f "$NAME" >/dev/null 2>&1 || true
      password="${TEST_DB_PASSWORD:-$(od -An -tx1 -N24 /dev/urandom | tr -d ' \n')}"
      [[ "$password" =~ ^[A-Za-z0-9]{16,}$ ]] || { echo "TEST_DB_PASSWORD must be 16 or more letters or digits" >&2; exit 2; }
      # given through the environment, so the value never shows in the process list
      POSTGRES_PASSWORD="$password" docker run -d --name "$NAME" \
        -e POSTGRES_USER=taskora -e POSTGRES_PASSWORD -e POSTGRES_DB=taskora \
        -p "127.0.0.1:${PORT}:5432" --tmpfs /var/lib/postgresql/data \
        "$IMAGE" >/dev/null
    fi
    for _ in $(seq 1 60); do
      if docker exec "$NAME" pg_isready -h 127.0.0.1 -U taskora -d taskora >/dev/null 2>&1; then
        echo "postgresql://taskora:${password}@127.0.0.1:${PORT}/taskora"
        exit 0
      fi
      sleep 1
    done
    echo "postgres did not become ready" >&2
    docker logs "$NAME" >&2 || true
    exit 1
    ;;
  stop)
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    ;;
  *)
    echo "usage: $0 start|stop" >&2
    exit 2
    ;;
esac

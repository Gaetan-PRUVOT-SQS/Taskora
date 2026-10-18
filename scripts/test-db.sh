#!/usr/bin/env bash
# Throwaway PostgreSQL 16 for the tests, in Docker, data kept in tmpfs.
#   scripts/test-db.sh start   start (or reuse) the container, print its URL on stdout
#   scripts/test-db.sh stop    remove the container
# The tests then create one database per test file on this server.
set -euo pipefail

NAME="${TEST_DB_CONTAINER:-taskora-test-pg}"
PORT="${TEST_DB_PORT:-55432}"
IMAGE="${TEST_DB_IMAGE:-postgres:16-alpine}"
URL="postgresql://taskora:taskora@127.0.0.1:${PORT}/taskora"

case "${1:-}" in
  start)
    if ! docker info >/dev/null 2>&1; then
      echo "docker is not available" >&2
      exit 1
    fi
    if [[ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null || true)" != "true" ]]; then
      docker rm -f "$NAME" >/dev/null 2>&1 || true
      docker run -d --name "$NAME" \
        -e POSTGRES_USER=taskora -e POSTGRES_PASSWORD=taskora -e POSTGRES_DB=taskora \
        -p "127.0.0.1:${PORT}:5432" --tmpfs /var/lib/postgresql/data \
        "$IMAGE" >/dev/null
    fi
    for _ in $(seq 1 60); do
      if docker exec "$NAME" pg_isready -h 127.0.0.1 -U taskora -d taskora >/dev/null 2>&1; then
        echo "$URL"
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

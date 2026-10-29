#!/usr/bin/env bash
# Throwaway PostgreSQL for the tests.
#   scripts/test-db.sh start   start (or reuse) the server, print its URL on stdout
#   scripts/test-db.sh stop    stop it
# Docker when the daemon answers, otherwise the local postgres binary.
# The tests then create one database per test file on this server.
set -euo pipefail

NAME="${TEST_DB_CONTAINER:-taskora-test-pg}"
PORT="${TEST_DB_PORT:-55432}"
IMAGE="${TEST_DB_IMAGE:-postgres:16-alpine}"
URL="postgresql://taskora:taskora@127.0.0.1:${PORT}/taskora"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="${HOME}/.local/bin:${PATH}"

docker_ready()
{
	docker info >/dev/null 2>&1
}

start_docker()
{
	if [[ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null || true)" != "true" ]]; then
		docker rm -f "$NAME" >/dev/null 2>&1 || true
		docker run -d --name "$NAME" \
			-e POSTGRES_USER=taskora -e POSTGRES_PASSWORD=taskora -e POSTGRES_DB=taskora \
			-p "127.0.0.1:${PORT}:5432" --tmpfs /var/lib/postgresql/data \
			"$IMAGE" >/dev/null
	fi
	local _
	for _ in $(seq 1 60); do
		if docker exec "$NAME" pg_isready -h 127.0.0.1 -U taskora -d taskora >/dev/null 2>&1; then
			printf '%s\n' "$URL"
			return 0
		fi
		sleep 1
	done
	echo "postgres did not become ready" >&2
	docker logs "$NAME" >&2 || true
	return 1
}

start_local()
{
	local bindir datadir logfile ready
	if ! command -v postgres >/dev/null 2>&1 || ! command -v initdb >/dev/null 2>&1 || ! command -v pg_ctl >/dev/null 2>&1; then
		echo "docker is not available and postgres is not installed" >&2
		return 1
	fi
	bindir="$(dirname "$(command -v postgres)")"
	datadir="${TEST_DB_DIR:-$ROOT/test-results/pgdata}"
	logfile="$ROOT/test-results/postgres.log"
	mkdir -p -- "$ROOT/test-results"
	if [[ ! -f "$datadir/PG_VERSION" ]]; then
		rm -rf -- "$datadir"
		"$bindir/initdb" -D "$datadir" --username=taskora --auth=trust --encoding=UTF8 --locale=C >/dev/null
	fi
	if ! "$bindir/pg_isready" -h 127.0.0.1 -p "$PORT" -U taskora -d postgres >/dev/null 2>&1; then
		"$bindir/pg_ctl" -D "$datadir" -l "$logfile" -w \
			-o "-p $PORT -h 127.0.0.1 -k $datadir" start >/dev/null
	fi
	ready="$("$bindir/psql" -h 127.0.0.1 -p "$PORT" -U taskora -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'taskora'")"
	if [[ "$ready" != "1" ]]; then
		"$bindir/createdb" -h 127.0.0.1 -p "$PORT" -U taskora taskora
	fi
	printf '%s\n' "$URL"
}

stop_local()
{
	local bindir datadir
	if ! command -v pg_ctl >/dev/null 2>&1 || ! command -v postgres >/dev/null 2>&1; then
		return 0
	fi
	bindir="$(dirname "$(command -v postgres)")"
	datadir="${TEST_DB_DIR:-$ROOT/test-results/pgdata}"
	if [[ -f "$datadir/PG_VERSION" ]]; then
		"$bindir/pg_ctl" -D "$datadir" -m fast -w stop >/dev/null 2>&1 || true
	fi
}

case "${1:-}" in
start)
	if docker_ready; then
		start_docker
	else
		start_local
	fi
	;;
stop)
	if docker_ready; then
		docker rm -f "$NAME" >/dev/null 2>&1 || true
	else
		stop_local
	fi
	;;
*)
	echo "usage: $0 start|stop" >&2
	exit 2
	;;
esac

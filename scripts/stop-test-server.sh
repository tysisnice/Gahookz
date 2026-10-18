#!/usr/bin/env bash
# Stop the test server on one port, and nothing else.
#
# `pkill -f server.js` matches the live production, beta and development
# containers as well as your test server, because the host sees the processes
# inside them. On 2026-10-12 and 2026-10-13 that is exactly what happened:
# production and beta were killed and restarted by Docker (ending any games in
# progress) and the development container's inner server was killed and stayed
# dead for six days. See the 2026-10-18 dev-watcher record.
#
#   bash scripts/stop-test-server.sh          # port 3199, the harness default
#   bash scripts/stop-test-server.sh 3197     # any other test port
#
# `npm run test:disposable` already stops its own child, so this is for a
# server you started by hand, or one left behind by an interrupted run.
set -Eeuo pipefail

port="${1:-3199}"
if [[ ! "$port" =~ ^[0-9]+$ ]]; then
  echo "Usage: bash scripts/stop-test-server.sh [port]   (default 3199)" >&2
  exit 2
fi
if [[ "$port" == 3101 || "$port" == 3102 || "$port" == 3103 ]]; then
  echo "Port ${port} is a live service (development, production, beta). This script will not stop those." >&2
  echo "Use: docker compose up -d --no-deps --force-recreate <service>   (naming the one service you mean)" >&2
  exit 1
fi

# A port a container publishes is a service, whatever it is called. Depending
# on how Docker publishes ports, the host-side listener can be docker-proxy or
# nothing visible to `ss` at all, so ask Docker before looking for a process.
if command -v docker >/dev/null 2>&1; then
  publisher="$(docker ps -q --filter "publish=${port}" 2>/dev/null | head -1 || true)"
  if [[ -n "$publisher" ]]; then
    echo "Port ${port} is published by container $(docker inspect --format '{{.Name}}' "$publisher" 2>/dev/null || echo "$publisher"); refusing to stop it." >&2
    exit 1
  fi
fi

pid="$(ss -lptnH "sport = :${port}" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1 || true)"
if [[ -z "$pid" ]]; then
  echo "Nothing is listening on 127.0.0.1:${port}."
  exit 0
fi

# A listener inside a container is a real service, whatever port it publishes.
if grep -qE '/(docker|libpod)-|/docker/' "/proc/${pid}/cgroup" 2>/dev/null; then
  echo "The listener on ${port} (pid ${pid}) is inside a container; refusing to stop it." >&2
  echo "Check with: docker ps --filter publish=${port}" >&2
  exit 1
fi

command_line="$(tr '\0' ' ' < "/proc/${pid}/cmdline" 2>/dev/null || echo unknown)"
echo "Stopping pid ${pid} on port ${port}: ${command_line}"
kill -TERM "$pid"
for _ in $(seq 1 20); do
  kill -0 "$pid" 2>/dev/null || { echo "Stopped."; exit 0; }
  sleep 0.5
done
echo "Pid ${pid} is still running after 10s. Inspect it before using SIGKILL:" >&2
echo "  ps -fp ${pid}" >&2
exit 1

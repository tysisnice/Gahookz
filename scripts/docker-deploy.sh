#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed or is not on PATH." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "The Docker Compose plugin is unavailable. Try: sudo dnf install docker-compose-plugin" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
  echo "Created .env from the safe localhost defaults."
fi

if [[ ! -s standalone/public/app.jsx || ! -s standalone/build-client.mjs ]]; then
  echo "The browser source or Docker build script is missing from this project copy." >&2
  exit 1
fi

# Stamp the exact source revision into the image so /api/health can report
# which server code is running. The browser release hash cannot: it covers only
# files under standalone/public, so a server-only change leaves it unchanged.
if git -C "$ROOT_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  GAHOOKZ_REVISION="$(git -C "$ROOT_DIR" rev-parse --short=12 HEAD)"
  if ! git -C "$ROOT_DIR" diff --quiet HEAD 2>/dev/null; then
    GAHOOKZ_REVISION="${GAHOOKZ_REVISION}-dirty"
    echo "WARNING: deploying a working tree with uncommitted changes (${GAHOOKZ_REVISION})." >&2
  fi
else
  GAHOOKZ_REVISION="unknown"
  echo "WARNING: not a Git checkout; /api/health will report revision 'unknown'." >&2
fi
GAHOOKZ_BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export GAHOOKZ_REVISION GAHOOKZ_BUILT_AT
echo "Building revision ${GAHOOKZ_REVISION}."

docker compose config --quiet

# Deploy into the Compose project that actually owns production. compose.yaml
# declares `name: gahookz`, which is also the development stack's project, so a
# machine running production from a separate clone must set COMPOSE_PROJECT_NAME
# in its .env. Without it this script targets the wrong project: it builds the
# image, then fails binding a port the live container already holds, leaving
# production on the old code with a broken container beside it.
prod_port="$(grep -E '^GAHOOKZ_PROD_PORT=' .env 2>/dev/null | cut -d= -f2- || true)"
prod_port="${prod_port:-3102}"
owned_container="$(docker compose ps -q gahookz 2>/dev/null || true)"
port_holder="$(docker ps --filter "publish=${prod_port}" --format '{{.ID}}' | head -1)"
if [[ -n "$port_holder" && ( -z "$owned_container" || "$owned_container" != "$port_holder"* ) ]]; then
  holder_project="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$port_holder" 2>/dev/null || true)"
  echo "Port ${prod_port} is published by Compose project '${holder_project:-unknown}', which this deploy does not own." >&2
  echo "Set COMPOSE_PROJECT_NAME=${holder_project:-<project>} in ${ROOT_DIR}/.env, then run this again." >&2
  exit 1
fi

docker compose build --pull gahookz

# Drain before replacing. Rooms are process-local, so recreating the container
# ends every game it is hosting. Ask the running node to stop accepting new
# rooms, then wait for the ones in progress to finish.
DRAIN_WAIT_SECONDS="${GAHOOKZ_DRAIN_WAIT_SECONDS:-0}"
current_id="$(docker compose ps -q gahookz 2>/dev/null || true)"
if [[ -n "$current_id" && "$DRAIN_WAIT_SECONDS" -gt 0 ]]; then
  metrics_token="$(grep -E '^GAHOOKZ_METRICS_TOKEN=' .env 2>/dev/null | cut -d= -f2- || true)"
  if [[ -n "$metrics_token" ]]; then
    echo "Draining: no new rooms will be accepted for up to ${DRAIN_WAIT_SECONDS}s."
    docker exec "$current_id" node -e "
      fetch('http://127.0.0.1:3001/api/drain', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.argv[1] },
        body: JSON.stringify({ active: true })
      }).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))
    " "$metrics_token" || echo "WARNING: could not put the running node into drain." >&2

    for _ in $(seq 1 "$DRAIN_WAIT_SECONDS"); do
      active="$(docker exec "$current_id" node -e "
        fetch('http://127.0.0.1:3001/api/ready')
          .then((r) => r.json())
          .then((v) => process.stdout.write(String(v.activeRooms ?? '?')))
          .catch(() => process.stdout.write('?'))
      " 2>/dev/null || echo '?')"
      [[ "$active" == "0" ]] && { echo "All games finished; proceeding."; break; }
      printf '\r  %s room(s) still playing... ' "$active"
      sleep 1
    done
    echo
  else
    echo "No GAHOOKZ_METRICS_TOKEN in .env, so the node cannot be drained first." >&2
  fi
elif [[ -n "$current_id" ]]; then
  echo "Replacing production immediately. Active games will end."
  echo "Set GAHOOKZ_DRAIN_WAIT_SECONDS=300 to let games finish first."
fi

docker compose up -d --force-recreate --remove-orphans gahookz

container_id="$(docker compose ps -q gahookz)"
if [[ -z "$container_id" ]]; then
  echo "Gahookz did not create a container." >&2
  docker compose ps
  exit 1
fi

for _ in $(seq 1 30); do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
  if [[ "$health" == "healthy" ]]; then
    expected_image="$(docker image inspect --format '{{.Id}}' gahookz:local)"
    running_image="$(docker inspect --format '{{.Image}}' "$container_id")"
    if [[ "$running_image" != "$expected_image" ]]; then
      echo "The running container does not use the image that was just built." >&2
      exit 1
    fi
    health_json="$(docker exec "$container_id" node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>r.text()).then(v=>process.stdout.write(v)).catch(()=>process.exit(1))")"
    release="$(printf '%s' "$health_json" | sed -n 's/.*\"release\":\"\([^\"]*\)\".*/\1/p')"
    revision="$(printf '%s' "$health_json" | sed -n 's/.*\"revision\":\"\([^\"]*\)\".*/\1/p')"
    if [[ "$revision" != "$GAHOOKZ_REVISION" ]]; then
      echo "The running server reports revision '${revision}', expected '${GAHOOKZ_REVISION}'." >&2
      exit 1
    fi
    docker compose ps
    echo "Gahookz ${release} (revision ${revision}) is healthy at http://127.0.0.1:${GAHOOKZ_PROD_PORT:-3102}/api/health"
    exit 0
  fi
  if [[ "$health" == "unhealthy" || "$health" == "exited" || "$health" == "dead" ]]; then
    break
  fi
  sleep 2
done

echo "Gahookz did not become healthy in time. Recent logs:" >&2
docker compose logs --tail=100 gahookz >&2
exit 1

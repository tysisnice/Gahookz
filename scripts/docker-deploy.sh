#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Value of NAME as Compose would see it: the environment wins over .env.
env_value() {
  local name="$1" value="${!1:-}"
  if [[ -z "$value" ]]; then
    value="$(grep -E "^${name}=" .env 2>/dev/null | tail -1 | cut -d= -f2- || true)"
  fi
  printf '%s' "$value"
}

# Rooms in progress on the running production node, read over its published
# port (no token needed). Prints "?" when it cannot be read.
prod_active_rooms() {
  local json value
  json="$(curl -fsS --max-time 5 "http://127.0.0.1:${prod_port}/api/health" 2>/dev/null || true)"
  value="$(printf '%s' "$json" | sed -n 's/.*"activeRooms":\([0-9][0-9]*\).*/\1/p')"
  printf '%s' "${value:-?}"
}

# Drain state must never outlive an aborted deploy: a node left draining
# refuses every new room until it restarts.
DRAIN_ACTIVE=0
DRAIN_CONTAINER=""
drain_request() {
  docker exec "$DRAIN_CONTAINER" node -e "
    fetch('http://127.0.0.1:3001/api/drain', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.argv[1] },
      body: JSON.stringify({ active: process.argv[2] === 'true' })
    }).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))
  " "$metrics_token" "$1"
}
cancel_drain() {
  if [[ "$DRAIN_ACTIVE" == "1" ]]; then
    DRAIN_ACTIVE=0
    if drain_request false; then
      echo "Drain cancelled: production accepts new rooms again." >&2
    else
      echo "WARNING: could not cancel the drain. Production refuses new rooms until it restarts or you POST /api/drain {\"active\":false}." >&2
    fi
  fi
}
trap cancel_drain EXIT
trap 'echo >&2; echo "Interrupted." >&2; exit 130' INT
trap 'echo >&2; echo "Terminated." >&2; exit 143' TERM

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
prod_port="$(env_value GAHOOKZ_PROD_PORT)"
prod_port="${prod_port:-3102}"
prod_image="$(env_value GAHOOKZ_PROD_IMAGE)"
prod_image="${prod_image:-gahookz:prod-local}"
owned_container="$(docker compose ps -q gahookz 2>/dev/null || true)"
port_holder="$(docker ps --filter "publish=${prod_port}" --format '{{.ID}}' | head -1)"
if [[ -n "$port_holder" && ( -z "$owned_container" || "$owned_container" != "$port_holder"* ) ]]; then
  holder_project="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$port_holder" 2>/dev/null || true)"
  echo "Port ${prod_port} is published by Compose project '${holder_project:-unknown}', which this deploy does not own." >&2
  echo "Set COMPOSE_PROJECT_NAME=${holder_project:-<project>} in ${ROOT_DIR}/.env, then run this again." >&2
  exit 1
fi

# Building overwrites the production image tag, so label what is running now.
# The tag points at the image id, which stays valid after the retag.
current_id="$(docker compose ps -q gahookz 2>/dev/null || true)"
if [[ -n "$current_id" ]]; then
  rollback_tag="gahookz:rollback-prod-$(date +%Y%m%d-%H%M)"
  if docker tag "$(docker inspect --format '{{.Image}}' "$current_id")" "$rollback_tag"; then
    echo "Rollback target: ${rollback_tag}"
    echo "  Restore with: GAHOOKZ_PROD_IMAGE=${rollback_tag} docker compose up -d --force-recreate --no-build gahookz"
  else
    echo "Could not tag the running image as a rollback target." >&2
    [[ "${GAHOOKZ_FORCE_REPLACE:-0}" == "1" ]] || exit 1
  fi
fi

docker compose build --pull gahookz

# Drain before replacing. Rooms are process-local, so recreating the container
# ends every game it is hosting. Ask the running node to stop accepting new
# rooms, then wait for the ones in progress to finish.
DRAIN_WAIT_SECONDS="${GAHOOKZ_DRAIN_WAIT_SECONDS:-0}"
FORCE_REPLACE="${GAHOOKZ_FORCE_REPLACE:-0}"
current_id="$(docker compose ps -q gahookz 2>/dev/null || true)"
if [[ -n "$current_id" && "$DRAIN_WAIT_SECONDS" -gt 0 ]]; then
  metrics_token="$(env_value GAHOOKZ_METRICS_TOKEN)"
  if [[ -n "$metrics_token" ]]; then
    echo "Draining: no new rooms will be accepted for up to ${DRAIN_WAIT_SECONDS}s."
    DRAIN_CONTAINER="$current_id"
    DRAIN_ACTIVE=1
    drain_request true || echo "WARNING: could not put the running node into drain." >&2

    active="?"
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
    if [[ "$active" != "0" ]]; then
      if [[ "$FORCE_REPLACE" == "1" ]]; then
        echo "Drain wait expired with ${active} room(s) still running; GAHOOKZ_FORCE_REPLACE=1, so replacing anyway. Those games will end." >&2
      else
        echo "Drain wait of ${DRAIN_WAIT_SECONDS}s expired with ${active} room(s) still running. Production was not replaced." >&2
        echo "Run again with a longer GAHOOKZ_DRAIN_WAIT_SECONDS, or set GAHOOKZ_FORCE_REPLACE=1 to end those games." >&2
        exit 1   # the EXIT trap cancels the drain
      fi
    fi
    # The replacement container starts without drain, so nothing to cancel now.
    DRAIN_ACTIVE=0
  else
    active="$(prod_active_rooms)"
    echo "No GAHOOKZ_METRICS_TOKEN in .env, so the node cannot be drained first." >&2
    if [[ "$active" == "0" ]]; then
      echo "No rooms are active; proceeding."
    elif [[ "$FORCE_REPLACE" == "1" ]]; then
      echo "Production reports ${active} active room(s); GAHOOKZ_FORCE_REPLACE=1, so replacing anyway. Those games will end." >&2
    else
      echo "Production reports ${active} active room(s) and cannot be drained. Production was not replaced." >&2
      echo "Set GAHOOKZ_METRICS_TOKEN in .env to drain, wait until no rooms are active, or set GAHOOKZ_FORCE_REPLACE=1 to end those games." >&2
      exit 1
    fi
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
    expected_image="$(docker image inspect --format '{{.Id}}' "$prod_image")"
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
    echo "Gahookz ${release} (revision ${revision}) is healthy at http://127.0.0.1:${prod_port}/api/health"
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

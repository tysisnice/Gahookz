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

docker compose config --quiet
docker compose build --pull gahookz
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
    release="$(docker exec "$container_id" node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>r.json()).then(v=>process.stdout.write(String(v.release||'unknown'))).catch(()=>process.exit(1))")"
    docker compose ps
    echo "Gahookz ${release} is healthy at http://127.0.0.1:${GAHOOKZ_PROD_PORT:-3102}/api/health"
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

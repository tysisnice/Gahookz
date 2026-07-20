#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

docker compose ps
container_id="$(docker compose ps -q gahookz)"
if [[ -n "$container_id" ]]; then
  docker inspect --format 'Container health: {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id"
  docker exec "$container_id" node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>r.json()).then(v=>console.log('Running release: '+String(v.release||'unknown')+' (built '+String(v.builtAt||'unknown')+')')).catch(e=>{console.error(e.message);process.exit(1)})"
fi
docker compose logs --tail=40 gahookz

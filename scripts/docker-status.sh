#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Every service in the project, not just production. This script used to
# inspect `gahookz` alone, which is how the development container sat "Up"
# with a dead server inside it for eight days: the only status command anybody
# runs never mentioned dev. A container can be up, have a failing health
# check, and still be reported as running by `docker compose ps`, so each
# service is asked directly whether its server answers.
docker compose ps

problems=0
note_problem() {
  problems=1
  echo "  ATTENTION: $1" >&2
}

echo
for service in $(docker compose ps --services | sort); do
  container_id="$(docker compose ps -q "$service" 2>/dev/null || true)"
  if [[ -z "$container_id" ]]; then
    echo "${service}: not running"
    note_problem "${service} has no container. Start it with: docker compose up -d --no-deps ${service}"
    continue
  fi

  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || echo unknown)"
  echo "${service}: ${health}"

  # Report the Git revision as well as the browser release. The release hash
  # covers only standalone/public, so a server-only change leaves it unchanged
  # and cannot tell you which server code is actually running.
  if info="$(docker exec "$container_id" node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>r.json()).then(v=>console.log('  release '+String(v.release||'unknown')+' (built '+String(v.builtAt||'unknown')+')\n  revision '+String(v.revision||'unknown')+' (instance '+String(v.instance||'unknown')+', draining '+String(v.draining??'unknown')+', '+String(v.activeRooms??'?')+' active room(s))')).catch(e=>{console.error(e.message);process.exit(1)})" 2>/dev/null)"; then
    echo "$info"
  else
    note_problem "${service} is up but its server did not answer /api/health inside the container. Recreate just this one: docker compose up -d --no-deps --force-recreate ${service}"
  fi

  case "$health" in
    healthy|running) ;;
    *) note_problem "${service} reports health '${health}'." ;;
  esac
done

echo
docker compose logs --tail=40 gahookz

if (( problems )); then
  echo >&2
  echo "One or more services need attention; see the ATTENTION lines above." >&2
  exit 1
fi

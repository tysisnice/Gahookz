#!/usr/bin/env bash
# Exercise scripts/docker-deploy.sh against stub `docker` and `curl` commands.
#
# The deploy script is the one piece of this project that cannot be tested by
# running it: it replaces the container real people are playing on. So it is
# run here against a fake Docker. Each case builds a stub `docker` that answers
# the handful of queries the script makes, puts it first on PATH, runs the
# script in a throwaway copy of the repository, and asserts on what it said and
# whether it would have replaced production.
#
#   bash scripts/docker-deploy.test.sh
#
# Nothing here touches a real container, image, port or network: a case that
# reached real Docker would fail, because the stub is the only `docker` on PATH.
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

passed=0
failed=0

# A stub docker that records what it was asked to do. ACTIVE_ROOMS and
# HEALTH are read from the environment so each case can set the world up.
make_stubs() {
  local dir="$1"
  mkdir -p "$dir/bin"
  cat > "$dir/bin/docker" <<'STUB'
#!/usr/bin/env bash
echo "docker $*" >> "$DEPLOY_TEST_CALLS"
# Match on the whole command line: `docker compose ps` and
# `docker compose ps -q gahookz` are different questions with different answers.
case "$*" in
  "compose version"*|"compose config"*|"compose build"*|"compose logs"*) exit 0 ;;
  "compose ps -q"*)
    # The running production container id, or nothing if it is not running.
    [[ "${DEPLOY_TEST_RUNNING:-1}" == "1" ]] && echo "containerid123"
    exit 0 ;;
  "compose ps") exit 0 ;;
  "compose up"*)
    echo "replaced" >> "$DEPLOY_TEST_CALLS"; exit 0 ;;
  "ps --filter"*)
    # Who publishes the production port: this deploy's own container by default.
    case "${DEPLOY_TEST_PORT_HOLDER:-self}" in
      self)  echo "containerid123" ;;
      other) echo "someoneelse456" ;;
    esac
    exit 0 ;;
  "inspect --format"*)
    case "$*" in
      *State.Health*)     echo "${DEPLOY_TEST_HEALTH:-healthy}" ;;
      *compose.project*)  echo "${DEPLOY_TEST_HOLDER_PROJECT:-gahookz-prod}" ;;
      *.Image*)           echo "imagesha-current" ;;
      *)                  echo "" ;;
    esac
    exit 0 ;;
  "image inspect"*) echo "imagesha-current"; exit 0 ;;
  "tag"*) exit 0 ;;
  "exec"*)
    # The script talks to the node inside the container through `docker exec`:
    # POST /api/drain to start or cancel a drain, GET /api/ready to count rooms.
    if [[ "$*" == *"api/drain"* ]]; then
      # The drain state is the last argument: "true" to start, "false" to
      # cancel. Logged on one line, because the inline node script is not.
      echo "drain-request ${!#}" >> "$DEPLOY_TEST_CALLS"
      [[ "${DEPLOY_TEST_DRAIN_OK:-1}" == "1" ]] && exit 0 || exit 1
    fi
    if [[ "$*" == *"api/health"* ]]; then
      printf '{"ok":true,"release":"testrelease","revision":"%s"}' "${DEPLOY_TEST_REVISION:-unknown}"
      exit 0
    fi
    printf '%s' "${DEPLOY_TEST_ACTIVE_ROOMS:-0}"
    exit 0 ;;
esac
exit 0
STUB
  # The no-token path reads the published port over curl instead.
  cat > "$dir/bin/curl" <<'STUB'
#!/usr/bin/env bash
printf '{"ok":true,"activeRooms":%s,"revision":"testrev","release":"testrelease"}' "${DEPLOY_TEST_ACTIVE_ROOMS:-0}"
STUB
  chmod +x "$dir/bin/docker" "$dir/bin/curl"
}

# One case: name, expected exit status, expected text, then VAR=value settings.
# run_case <name> <expected exit> [--no-replace] <expected text> [VAR=value ...]
run_case() {
  local name="$1" expect_status="$2"; shift 2
  local EXPECT_NO_REPLACE=0 EXPECT_DRAIN_CANCEL=0
  while :; do
    case "${1:-}" in
      --no-replace)  EXPECT_NO_REPLACE=1; shift ;;
      --drain-cancel) EXPECT_DRAIN_CANCEL=1; shift ;;
      *) break ;;
    esac
  done
  local expect_text="$1"; shift
  local dir="$WORK/$RANDOM$RANDOM"
  mkdir -p "$dir"
  # A throwaway copy: the script cds to its own parent, so it must not be ours.
  mkdir -p "$dir/repo/scripts" "$dir/repo/standalone/public"
  cp "$ROOT_DIR/scripts/docker-deploy.sh" "$dir/repo/scripts/"
  cp "$ROOT_DIR/compose.yaml" "$dir/repo/" 2>/dev/null || true
  # The script refuses a copy missing the browser source, so give it the two
  # files it checks for. Their contents never matter: the build is stubbed.
  echo "// stub" > "$dir/repo/standalone/public/app.jsx"
  echo "// stub" > "$dir/repo/standalone/build-client.mjs"
  printf 'GAHOOKZ_PROD_PORT=3102\nCOMPOSE_PROJECT_NAME=gahookz-prod\n' > "$dir/repo/.env"
  make_stubs "$dir"

  local calls="$dir/calls.log"
  : > "$calls"
  local output status
  output="$(cd "$dir/repo" && env -i \
    PATH="$dir/bin:/usr/bin:/bin" HOME="$dir" \
    DEPLOY_TEST_CALLS="$calls" \
    GAHOOKZ_REVISION=testrev \
    "$@" \
    bash scripts/docker-deploy.sh 2>&1)" && status=0 || status=$?

  local problem=""
  [[ "$status" == "$expect_status" ]] || problem="exit ${status}, expected ${expect_status}"
  if [[ -n "$expect_text" ]] && ! grep -qF "$expect_text" <<<"$output"; then
    problem="${problem:+$problem; }missing text: ${expect_text}"
  fi
  # Cases tagged EXPECT_NO_REPLACE=1 are the ones whose whole purpose is that
  # production was left alone. A post-deploy failure, by contrast, happens
  # after the replacement by definition.
  if [[ "${EXPECT_NO_REPLACE:-0}" == "1" ]] && grep -q '^replaced$' "$calls"; then
    problem="${problem:+$problem; }production was replaced when it should have been left alone"
  fi
  # A drain the script started and then abandoned leaves production refusing
  # every new room until it restarts. The EXIT trap must cancel it, which means
  # a second /api/drain call carrying `false`.
  if [[ "${EXPECT_DRAIN_CANCEL:-0}" == "1" ]] && ! grep -q '^drain-request false$' "$calls"; then
    problem="${problem:+$problem; }the drain was left on after the deploy gave up"
  fi

  if [[ -z "$problem" ]]; then
    printf 'ok   %s\n' "$name"
    passed=$((passed + 1))
  else
    printf 'FAIL %s\n       %s\n' "$name" "$problem"
    printf '%s\n' "$output" | sed 's/^/       | /'
    failed=$((failed + 1))
  fi
}

# --- the cases ---------------------------------------------------------------

run_case "a quiet room is replaced without a drain window" 0 \
  "No rooms are active" \
  DEPLOY_TEST_ACTIVE_ROOMS=0

run_case "games in progress and no drain window: refuses" 1 --no-replace \
  "no drain window was set" \
  DEPLOY_TEST_ACTIVE_ROOMS=3

run_case "games in progress, forced: replaces and says so" 0 \
  "so replacing anyway" \
  DEPLOY_TEST_ACTIVE_ROOMS=3 GAHOOKZ_FORCE_REPLACE=1

run_case "a drain wait that expires with rooms left: refuses" 1 --no-replace --drain-cancel \
  "Production was not replaced" \
  DEPLOY_TEST_ACTIVE_ROOMS=2 GAHOOKZ_DRAIN_WAIT_SECONDS=2 GAHOOKZ_METRICS_TOKEN=stub

run_case "a drain that empties the server: proceeds" 0 \
  "All games finished" \
  DEPLOY_TEST_ACTIVE_ROOMS=0 GAHOOKZ_DRAIN_WAIT_SECONDS=2 GAHOOKZ_METRICS_TOKEN=stub

run_case "a drain the node refuses is reported, not assumed" 1 --no-replace \
  "could not put the running node into drain" \
  DEPLOY_TEST_ACTIVE_ROOMS=2 DEPLOY_TEST_DRAIN_OK=0 \
  GAHOOKZ_DRAIN_WAIT_SECONDS=2 GAHOOKZ_METRICS_TOKEN=stub

run_case "another Compose project owns the port: refuses" 1 --no-replace \
  "which this deploy does not own" \
  DEPLOY_TEST_PORT_HOLDER=other DEPLOY_TEST_HOLDER_PROJECT=someproject

run_case "an unhealthy replacement is reported" 1 \
  "" \
  DEPLOY_TEST_ACTIVE_ROOMS=0 DEPLOY_TEST_HEALTH=unhealthy

printf '\n%d passed, %d failed\n' "$passed" "$failed"
[[ "$failed" == "0" ]]

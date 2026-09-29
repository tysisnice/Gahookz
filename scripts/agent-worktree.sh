#!/usr/bin/env bash
# Give one agent its own Git worktree, outside the synced project folder.
#
#   bash scripts/agent-worktree.sh <name> [base-ref]     new branch agent/<name> from base-ref (default HEAD)
#   bash scripts/agent-worktree.sh --reuse <name>        attach the existing branch agent/<name>
#
# The project folder (/mnt/storage/syncthing/Store/Projects/gahookz) is synced
# by Syncthing, source only. Parallel agents therefore work in their own
# worktree under $GAHOOKZ_WORKTREE_ROOT (default ~/gahookz-agent-worktrees) on
# the branch agent/<name>, and the orchestrator merges the result back.
#
# (~/gahookz-worktrees holds the worktrees of the old checkout in
# codex/2026-07-01/Gahookz, kept as a backup; do not reuse it.)
#
# node_modules is symlinked from the main checkout rather than reinstalled.
# That is safe because the server and tests import workspace packages by
# relative path (../packages/...), never through node_modules/@gahookz.
set -Eeuo pipefail

reuse=0
if [[ "${1:-}" == "--reuse" ]]; then
  reuse=1
  shift
fi
name="${1:-}"
base="${2:-HEAD}"
if [[ ! "$name" =~ ^[a-z0-9][a-z0-9-]{1,40}$ ]]; then
  echo "Usage: bash scripts/agent-worktree.sh [--reuse] <name> [base-ref]  (name: lowercase letters, digits, dashes)" >&2
  exit 2
fi

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE_ROOT="${GAHOOKZ_WORKTREE_ROOT:-$HOME/gahookz-agent-worktrees}"
target="$WORKTREE_ROOT/$name"
branch="agent/$name"

if [[ -e "$target" ]]; then
  echo "Refusing: $target already exists. Remove it with 'git worktree remove $target' first." >&2
  exit 1
fi
if git -C "$ROOT_DIR" show-ref --verify --quiet "refs/heads/$branch"; then
  if [[ "$reuse" -ne 1 ]]; then
    echo "Refusing: branch $branch already exists. Use --reuse to attach it, or pick another name." >&2
    exit 1
  fi
elif [[ "$reuse" -eq 1 ]]; then
  echo "Refusing: --reuse needs an existing branch $branch." >&2
  exit 1
fi

mkdir -p "$WORKTREE_ROOT"
if [[ "$reuse" -eq 1 ]]; then
  git -C "$ROOT_DIR" worktree add "$target" "$branch"
else
  git -C "$ROOT_DIR" worktree add -b "$branch" "$target" "$base"
fi
ln -s "$ROOT_DIR/node_modules" "$target/node_modules"
echo "Worktree ready: $target (branch $branch at $(git -C "$target" rev-parse --short HEAD))"

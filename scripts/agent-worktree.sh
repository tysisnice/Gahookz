#!/usr/bin/env bash
# Give one agent its own Git worktree, outside the Syncthing tree.
#
#   bash scripts/agent-worktree.sh <name> [base-ref]
#
# The Syncthing checkout is bind-mounted into the development container, so an
# edit there reloads dev.gahookz.com. Parallel agents therefore work in their
# own worktree under $GAHOOKZ_WORKTREE_ROOT (default ~/gahookz-worktrees) on the
# branch agent/<name>, and the orchestrator merges the result back.
#
# node_modules is symlinked from the main checkout rather than reinstalled.
# That is safe because the server and tests import workspace packages by
# relative path (../packages/...), never through node_modules/@gahookz.
set -Eeuo pipefail

name="${1:-}"
base="${2:-HEAD}"
if [[ ! "$name" =~ ^[a-z0-9][a-z0-9-]{1,40}$ ]]; then
  echo "Usage: bash scripts/agent-worktree.sh <name> [base-ref]  (name: lowercase letters, digits, dashes)" >&2
  exit 2
fi

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE_ROOT="${GAHOOKZ_WORKTREE_ROOT:-$HOME/gahookz-worktrees}"
target="$WORKTREE_ROOT/$name"
branch="agent/$name"

if [[ -e "$target" ]]; then
  echo "Refusing: $target already exists. Remove it with 'git worktree remove $target' first." >&2
  exit 1
fi
if git -C "$ROOT_DIR" show-ref --verify --quiet "refs/heads/$branch"; then
  echo "Refusing: branch $branch already exists. Pick another name or delete the old branch." >&2
  exit 1
fi

mkdir -p "$WORKTREE_ROOT"
git -C "$ROOT_DIR" worktree add -b "$branch" "$target" "$base"
ln -s "$ROOT_DIR/node_modules" "$target/node_modules"
echo "Worktree ready: $target (branch $branch from $(git -C "$target" rev-parse --short HEAD))"

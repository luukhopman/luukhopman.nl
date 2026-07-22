#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$APP_ROOT/frontend"
ENV_FILE="$APP_ROOT/.env.production"
RESTART_HELPER="/usr/local/sbin/restart-website"
BUILD_PARENT="$HOME/.cache"

fail() {
  printf 'Deploy failed: %s\n' "$*" >&2
  exit 1
}

test "$(id -un)" = "websiteadmin" || fail "run this command as websiteadmin"
test -f "$ENV_FILE" || fail "missing $ENV_FILE"
test -x "$RESTART_HELPER" || fail "missing restart helper"

cd "$APP_ROOT"
test -z "$(git status --porcelain)" || fail "the working tree must be clean"

branch="$(git branch --show-current)"
test -n "$branch" || fail "the repository is in detached HEAD state"

git fetch origin "$branch"
local_head="$(git rev-parse HEAD)"
remote_head="$(git rev-parse "origin/$branch")"
test "$local_head" = "$remote_head" || fail "push the current commit before deploying"

mkdir -p "$BUILD_PARENT"
build_root="$(mktemp -d "$BUILD_PARENT/website-deploy.XXXXXX")"
worktree_added=false
backup_next="$FRONTEND_DIR/.next.pre-deploy"

cleanup() {
  if "$worktree_added"; then
    git -C "$APP_ROOT" worktree remove --force "$build_root" >/dev/null 2>&1 || true
  else
    rm -rf "$build_root"
  fi
}
trap cleanup EXIT

git worktree add --detach "$build_root" HEAD
worktree_added=true

cd "$build_root/frontend"
node --env-file="$ENV_FILE" /usr/bin/npm ci
node --env-file="$ENV_FILE" /usr/bin/npm run typecheck
node --env-file="$ENV_FILE" /usr/bin/npm run test:run
node --env-file="$ENV_FILE" /usr/bin/npm run build
node --env-file="$ENV_FILE" /usr/bin/npm run migrate

cp -R public .next/standalone/
mkdir -p .next/standalone/.next
cp -R .next/static .next/standalone/.next/

rm -rf "$backup_next"
mv "$FRONTEND_DIR/.next" "$backup_next"
mv "$build_root/frontend/.next" "$FRONTEND_DIR/.next"

rollback() {
  printf 'New build failed its local health check; restoring the previous build.\n' >&2
  rm -rf "$FRONTEND_DIR/.next"
  mv "$backup_next" "$FRONTEND_DIR/.next"
  sudo "$RESTART_HELPER"
}

sudo "$RESTART_HELPER"

healthy=false
for _ in $(seq 1 30); do
  if systemctl is-active --quiet website.service && curl -fsS -o /dev/null http://127.0.0.1:3000/; then
    healthy=true
    break
  fi
  sleep 1
done

if ! "$healthy"; then
  rollback
  fail "the previous build was restored"
fi

rm -rf "$backup_next"

curl -fsS -o /dev/null https://luukhopman.nl/ || fail "local service is healthy, but the public HTTPS check failed"
printf 'Deployment complete: %s\n' "$local_head"

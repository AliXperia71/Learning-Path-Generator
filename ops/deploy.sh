#!/usr/bin/env bash
#
# Deploy the current upstream branch to this machine. Run it ON the server.
#
#   ./ops/deploy.sh          # shows what's about to land, then asks
#   ./ops/deploy.sh -y       # no prompt (for a cron or a script)
#
# What it guarantees, in order:
#   1. The checkout is clean — a production tree is a mirror, never a workspace.
#   2. You see every commit and every changed file before anything happens.
#   3. The database is backed up BEFORE the new code touches it.
#   4. If the new build doesn't come up healthy, it rolls the code back and
#      rebuilds the previous commit automatically.
#
# It is deliberately manual. This machine tracks a shared repo, so "someone
# merged a PR" must never be the same event as "production changed".
#
# .env files are gitignored and live only on this machine — `git pull` never
# touches them.

set -euo pipefail

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

HEALTH_URL="${CF_HEALTH_URL:-http://127.0.0.1:8080/api/health/db}"
APP_URL="${CF_APP_URL:-http://127.0.0.1:8080}"
HEALTH_TIMEOUT=300   # seconds; the api image's HEALTHCHECK alone allows 40s to boot

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

compose() { docker compose -f "$REPO_DIR/compose.yaml" "$@"; }

# --- preflight ---------------------------------------------------------------

[[ -f "$REPO_DIR/backend/.env" ]] || die "backend/.env is missing — the api container can't start without it."
command -v docker >/dev/null || die "docker not found."

if [[ -n "$(git status --porcelain)" ]]; then
  git status --short
  die "Working tree is dirty. A production checkout must be a clean mirror of the remote.
     Commit and push from your laptop, then re-run this. To discard local edits: git reset --hard"
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
OLD_REV="$(git rev-parse HEAD)"

say "Fetching $BRANCH"
git fetch --prune

UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)" \
  || die "$BRANCH has no upstream. Set one: git branch --set-upstream-to=origin/$BRANCH"
NEW_REV="$(git rev-parse "$UPSTREAM")"

if [[ "$OLD_REV" == "$NEW_REV" ]]; then
  say "Already up to date at ${OLD_REV:0:8} — nothing to deploy."
  exit 0
fi

# Refuse anything that isn't a fast-forward. Divergence means someone
# force-pushed or committed on the server; either way, look before you leap.
git merge-base --is-ancestor "$OLD_REV" "$NEW_REV" \
  || die "$UPSTREAM is not a fast-forward from HEAD (${OLD_REV:0:8}).
     The branch was rewritten, or this machine has commits of its own. Resolve it by hand."

# --- show, then confirm ------------------------------------------------------

say "About to deploy $UPSTREAM (${OLD_REV:0:8} -> ${NEW_REV:0:8})"
git --no-pager log --oneline --no-decorate "$OLD_REV..$NEW_REV"
echo
git --no-pager diff --stat "$OLD_REV..$NEW_REV"

# Changes to these need a human before they go live
if git diff --name-only "$OLD_REV..$NEW_REV" | grep -qE '(^|/)(compose\.yaml|Dockerfile|nginx\.conf|requirements\.txt|database\.py)$'; then
  echo
  echo "  ! Infrastructure or schema files changed in this range. Read the diff above."
fi

if [[ "${1:-}" != "-y" && "${1:-}" != "--yes" ]]; then
  echo
  read -r -p "Deploy these commits? [y/N] " reply
  [[ "$reply" =~ ^[Yy] ]] || { echo "Aborted. Nothing changed."; exit 1; }
fi

# --- back up before touching anything ----------------------------------------

say "Backing up the database first"
"$REPO_DIR/ops/backup-db.sh"

# --- deploy ------------------------------------------------------------------

say "Updating code"
git merge --ff-only "$NEW_REV"

deploy_and_check() {
  # Images build before containers are recreated, so a build failure leaves the
  # running version untouched — downtime is a container restart, not a build.
  compose up -d --build || return 1

  local waited=0
  while (( waited < HEALTH_TIMEOUT )); do
    if curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null | grep -q '"status":"healthy"'; then
      # The API being up doesn't prove nginx is serving the app. Check the SPA
      # fallback too — that's the half a bad frontend build would break.
      curl -fsS --max-time 5 "$APP_URL/some/client/route" 2>/dev/null | grep -q '<div id="root">' || return 1
      echo "  healthy after ${waited}s"
      return 0
    fi
    sleep 5
    waited=$((waited + 5))
  done
  return 1
}

say "Building and starting"
if deploy_and_check; then
  say "Deployed ${NEW_REV:0:8} successfully"
  docker image prune -f >/dev/null 2>&1 || true   # dangling layers only, never tagged images
  compose ps
else
  say "NEW BUILD IS UNHEALTHY — rolling back to ${OLD_REV:0:8}"
  git reset --hard "$OLD_REV"
  if deploy_and_check; then
    die "Rolled back to ${OLD_REV:0:8} and it is healthy. The bad commit range was $OLD_REV..$NEW_REV.
     Logs:  docker compose logs --tail=100 api"
  fi
  die "ROLLBACK ALSO FAILED — the site is down. Investigate now:
     docker compose ps
     docker compose logs --tail=200
     Latest database backup is under ~/backups/courseforge/"
fi

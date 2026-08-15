#!/usr/bin/env bash
#
# Back up the Course Forge database out of the Docker `cf-data` volume.
#
#   ./backup-db.sh [destination-dir]        # default: ~/backups/courseforge
#
# Two things this works around:
#
#   1. The DB lives inside a named volume, not at ~/.course_forge on the host, so
#      a plain host-side backup would quietly find nothing there.
#   2. `cp` of a live SQLite file can capture a torn write. sqlite3's backup API
#      is safe to run while the app is writing, so that's what this uses — via
#      Python's stdlib, because python:3.11-slim ships no sqlite3 CLI.
#
# Install as a nightly cron job (see README → "Self-hosting on your own machine"):
#   15 3 * * * /opt/course-forge/ops/backup-db.sh >> /var/log/cf-backup.log 2>&1

set -euo pipefail

# Resolve compose.yaml relative to this script, so cron's cwd doesn't matter
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/../compose.yaml"

DEST="${1:-$HOME/backups/courseforge}"
STAMP="$(date +%Y%m%d-%H%M%S)"
RETAIN_DAYS=30
TMP_IN_CONTAINER="/root/.course_forge/backup.tmp.db"

mkdir -p "$DEST"

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

# Clean up the in-container temp file even if the copy out fails
cleanup() { compose exec -T api rm -f "$TMP_IN_CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "[$(date -Is)] snapshotting database"
compose exec -T api python - "$TMP_IN_CONTAINER" <<'PY'
import sqlite3, sys

src = sqlite3.connect("/root/.course_forge/courseforge.db")
dst = sqlite3.connect(sys.argv[1])
src.backup(dst)          # consistent snapshot of a live database
dst.close()
src.close()
PY

compose cp "api:$TMP_IN_CONTAINER" "$DEST/courseforge-$STAMP.db"
gzip -f "$DEST/courseforge-$STAMP.db"
echo "[$(date -Is)] wrote $DEST/courseforge-$STAMP.db.gz"

# ---------------------------------------------------------------------------
# Off-box copy. The Veriton has a single SSD and no redundancy, so a backup that
# never leaves it only protects against bad migrations and app-level corruption
# — not against the drive dying. The Mac is already on the tailnet; set
# CF_BACKUP_REMOTE to an ssh target to mirror there too, e.g.
#   CF_BACKUP_REMOTE=alia71-mac:~/backups/courseforge
# ---------------------------------------------------------------------------
if [[ -n "${CF_BACKUP_REMOTE:-}" ]]; then
  echo "[$(date -Is)] mirroring to $CF_BACKUP_REMOTE"
  # No --delete on purpose: the remote accumulates. A mirror that deletes would
  # propagate an empty or broken local directory straight into the only off-box
  # copy, which is the one failure a backup must not have.
  rsync -a "$DEST/" "$CF_BACKUP_REMOTE/"
fi

find "$DEST" -name 'courseforge-*.db.gz' -mtime "+$RETAIN_DAYS" -delete
echo "[$(date -Is)] done — $(find "$DEST" -name 'courseforge-*.db.gz' | wc -l | tr -d ' ') snapshots retained"

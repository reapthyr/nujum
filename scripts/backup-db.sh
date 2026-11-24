#!/usr/bin/env sh
# Logical backup of the Nujum database using the *direct* (non-pooled) URL.
#
#   DIRECT_URL='postgresql://...' ./scripts/backup-db.sh
#
# Optional environment:
#   BACKUP_DIR       destination directory (default: ./backups, git-ignored)
#   RETENTION_DAYS   delete dumps older than this (default: 14, 0 keeps all)
#
# The connection string is passed to pg_dump via the environment and is never
# printed. Restores are documented in docs/deployment.md.

set -eu
umask 077

: "${DIRECT_URL:?DIRECT_URL is required (use the direct, non-pooled URL)}"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is not installed (apt-get install postgresql-client)." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${BACKUP_DIR}/nujum-${STAMP}.dump"
TMP="${FILE}.partial"

mkdir -p "$BACKUP_DIR"
trap 'rm -f "$TMP"' EXIT INT TERM

pg_dump --format=custom --no-owner --no-privileges --dbname="$DIRECT_URL" --file="$TMP"
if command -v pg_restore >/dev/null 2>&1; then
  pg_restore --list "$TMP" >/dev/null
fi
mv "$TMP" "$FILE"
trap - EXIT INT TERM

echo "Backup created: $FILE ($(wc -c <"$FILE") bytes)"

case "$RETENTION_DAYS" in
  ''|*[!0-9]*) echo "RETENTION_DAYS must be a non-negative integer." >&2; exit 1 ;;
esac
if [ "$RETENTION_DAYS" -gt 0 ]; then
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'nujum-*.dump' -mtime "+$RETENTION_DAYS" -delete
  echo "Pruned dumps older than ${RETENTION_DAYS} days."
fi

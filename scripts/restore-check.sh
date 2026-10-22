#!/usr/bin/env bash
# Proves a backup can be restored: restores the dump into a throwaway database on the same server and checks that every
# table has the row count recorded when the backup was taken. Exits non-zero on any problem. Never touches the real database.
#   DATABASE_URL=postgres://user:pass@host:5432/courtiq scripts/restore-check.sh backups/courtiq-<stamp>.dump
# DATABASE_URL is only used to find the server (the scratch database is created next to it and dropped afterwards).
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL}"
DUMP="${1:?usage: restore-check.sh <dump-file>}"
COUNTS="$DUMP.counts"
TOLERANCE_ROWS="${TOLERANCE_ROWS:-0}"
PG_BIN="${PG_BIN:-}"
pg() { if [ -n "$PG_BIN" ]; then "$PG_BIN/$1" "${@:2}"; else "$@"; fi; }
[ -f "$DUMP" ] || { echo "FAIL: dump file not found: $DUMP" >&2; exit 1; }
[ -f "$COUNTS" ] || { echo "FAIL: row-count file not found: $COUNTS (made by backup.sh)" >&2; exit 1; }

BASE="${DATABASE_URL%%\?*}"; QUERY=""; [ "$BASE" != "$DATABASE_URL" ] && QUERY="?${DATABASE_URL#*\?}"
SERVER="${BASE%/*}"
SCRATCH="courtiq_restorecheck_$(date -u +%s)_$$"
ADMIN="$SERVER/postgres$QUERY"
TARGET="$SERVER/$SCRATCH$QUERY"

cleanup() { pg psql "$ADMIN" -X -q -c "drop database if exists \"$SCRATCH\"" >/dev/null 2>&1 || true; }
trap cleanup EXIT

pg psql "$ADMIN" -X -q -v ON_ERROR_STOP=1 -c "create database \"$SCRATCH\"" >/dev/null
echo "restoring $(basename "$DUMP") into scratch database $SCRATCH ..."
pg pg_restore --dbname="$TARGET" --no-owner --no-privileges --exit-on-error "$DUMP" \
  || { echo "FAIL: pg_restore reported errors" >&2; exit 1; }

BAD=0
while IFS=$'\t' read -r table expected; do
  [ -n "$table" ] || continue
  actual="$(pg psql "$TARGET" -X -A -t -v ON_ERROR_STOP=1 -c "select count(*) from ${table%%.*}.\"${table#*.}\";" 2>/dev/null || echo MISSING)"
  if [ "$actual" = "MISSING" ]; then echo "FAIL  $table: table missing after restore"; BAD=1; continue; fi
  diff=$(( actual > expected ? actual - expected : expected - actual ))
  if [ "$diff" -gt "$TOLERANCE_ROWS" ]; then echo "FAIL  $table: expected $expected rows, restored $actual"; BAD=1
  else printf 'ok    %-40s %s rows\n' "$table" "$actual"; fi
done < "$COUNTS"

if [ "$BAD" -ne 0 ]; then echo "RESTORE CHECK FAILED" >&2; exit 1; fi
echo "RESTORE CHECK PASSED: every table restored with the expected row count"

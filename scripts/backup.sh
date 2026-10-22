#!/usr/bin/env bash
# Backs up the COURT IQ database to a compressed dump plus a small file of row counts used by restore-check.sh.
#   DATABASE_URL=postgres://user:pass@host:5432/courtiq scripts/backup.sh [output-dir]
# Needs pg_dump and psql on PATH (or set PG_BIN to their folder, e.g. /usr/lib/postgresql/16/bin).
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL}"
PG_BIN="${PG_BIN:-}"
pg() { if [ -n "$PG_BIN" ]; then "$PG_BIN/$1" "${@:2}"; else "$@"; fi; }

OUT_DIR="${1:-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT_DIR"
DUMP="$OUT_DIR/courtiq-$STAMP.dump"

# Row counts first, then the dump. On a busy system rows may arrive between the two steps;
# restore-check.sh accepts a small TOLERANCE_ROWS for that case (default 0 = exact, best on a quiet database).
TABLES="$(pg psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "
  select table_schema || '.' || table_name from information_schema.tables
  where table_type = 'BASE TABLE' and table_schema in ('public', 'drizzle') order by 1;")"
: > "$DUMP.counts"
for t in $TABLES; do
  n="$(pg psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "select count(*) from ${t%%.*}.\"${t#*.}\";")"
  printf '%s\t%s\n' "$t" "$n" >> "$DUMP.counts"
done

pg pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$DUMP"
echo "backup written: $DUMP ($(du -h "$DUMP" | cut -f1)), $(wc -l < "$DUMP.counts" | tr -d ' ') tables counted"

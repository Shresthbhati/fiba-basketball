# Backup and restore

A backup you have never restored is a hope, not a backup. Use both scripts.

## Take a backup

```
DATABASE_URL=postgres://user:pass@host:5432/courtiq scripts/backup.sh backups
```

Needs `pg_dump` and `psql` (set `PG_BIN` to their folder if they are not on `PATH`). It writes two files:

- `courtiq-<UTC stamp>.dump` — `pg_dump` custom format (no owners/privileges).
- `courtiq-<UTC stamp>.dump.counts` — row count of every table in `public` and `drizzle`, taken just before the dump.

Keep both files together. Copy them off the database host.

## Prove it restores

```
DATABASE_URL=postgres://user:pass@host:5432/courtiq scripts/restore-check.sh backups/courtiq-<stamp>.dump
```

Restores into a throwaway database on the same server (never the real one), compares every table's row count with the
`.counts` file, then drops the scratch database. Exit code 0 means it passed; anything else means do not trust that backup.
It fails on: missing/corrupt/truncated dump, missing `.counts`, a missing table, or a count mismatch.

On a busy database, rows can arrive between the count and the dump; set `TOLERANCE_ROWS=<n>` to allow that, or back up
from a quiet moment / replica.

## Restoring for real

Create an empty database, then `pg_restore --no-owner --no-privileges --dbname=<new db url> <dump>`, point `DATABASE_URL` at it and restart the API. Do this first on a copy.

## Status

Verified locally on PostgreSQL 16: backup, successful restore check, and the three failure cases above. Not scheduled
anywhere — run it from cron/your scheduler and alert on a non-zero exit.

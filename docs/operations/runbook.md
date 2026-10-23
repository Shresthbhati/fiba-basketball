# Runbook

## Configuration

| Variable | Where | Notes |
|---|---|---|
| `DATABASE_URL` | api | Required in production. |
| `ALLOWED_ORIGINS` | api | Required in production. Comma-separated origins of the web app. Browser writes from any other origin get 403 "Cross-origin request blocked". |
| `WEB_BASE_URL` | api | Required in production. Used for links in emails. |
| `SMTP_URL` / `MAIL_FROM` | api | Required in production. Without `SMTP_URL`, `MAIL_OUTBOX_DIR` writes JSON files, else mail is printed to the log (dev only). |
| `MEDIA_DIR` | api | Required in production. Persistent directory for uploaded game film; back it up with the database. `MAX_VIDEO_MB` (default 1024) caps one upload. |
| `PORT` | api | Default 3001. |
| `NODE_ENV` | api | `production` enables the start-up checks and secure cookies. |
| `RATE_LIMIT_SCALE` | api | Must be 1 in production (tests raise it). |
| `MAIL_OUTBOX_DIR` | api | Dev/test only; forbidden in production. |
| `API_URL` | web | A **build** argument (baked into the Next rewrites), not a runtime variable. Rebuild the web image to change it. |

In production the API exits 1 at start-up and lists every problem if the required values are missing or a dev-only value is set.

## Health

- `GET /health` — process is up (liveness).
- `GET /ready` — runs `select 1`; 503 `{"status":"NOT_READY"}` if the database is unreachable (readiness).

## Common tasks

- **Migrations:** applied automatically when the API starts (`services/api/src/db/connect.ts`). Take a backup before deploying a new version.
- **Force everyone to sign in again:** `delete from sessions;`
- **"Cross-origin request blocked":** the browser's origin is not in `ALLOWED_ORIGINS`.
- **Logs:** JSON via pino; cookies, authorization and set-cookie headers are redacted.

## Not verified

Docker image builds, `docker-compose.full.yml`, the CI `docker-build` job and real SMTP delivery were not run (no Docker/SMTP in the build environment).

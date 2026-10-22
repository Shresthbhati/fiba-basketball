# End-to-end tests

Real browser (Chromium) against the real stack: Postgres, the API, and the built web app.

```
# 1. Postgres (any 16+). Example with Docker:  docker compose up -d postgres
export DATABASE_URL=postgres://courtiq:courtiq@localhost:5432/courtiq

# 2. API (migrations run on start). ALLOWED_ORIGINS must list the web origin because the web app proxies /api.
(cd services/api && ALLOWED_ORIGINS=http://localhost:3000 pnpm exec tsx src/main.ts) &

# 3. Web
(cd apps/web && pnpm build && pnpm exec next start -p 3000) &

# 4. Run
pnpm exec playwright install chromium     # first time only
pnpm e2e
```

`CHROMIUM_PATH` points at an existing Chromium binary if you can't download one. `E2E_BASE_URL` overrides `http://localhost:3000`.

Covered: sign up, create a competition, add teams, create the schedule, score offline then reconnect and sync, reload, finish the game, public standings, and a stranger not seeing a draft.

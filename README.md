# COURT IQ

See docs/implementation-plan.md and AGENTS.md.

```
pnpm install
make dev                 # postgres, redis, minio, mailpit (needs Docker)
cp .env.example .env
pnpm --filter @courtiq/api dev      # applies migrations on start
pnpm --filter @courtiq/web dev
make test                # unit tests
make lint                # lint + typecheck
pnpm e2e                 # Playwright (needs a built web app and running API)
```

Operations: [runbook](docs/operations/runbook.md), [backup and restore](docs/operations/backup-restore.md).

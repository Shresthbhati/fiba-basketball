.PHONY: dev down test lint
dev:
	docker compose up -d --wait
down:
	docker compose down
test:
	pnpm -r test
lint:
	pnpm -r lint && pnpm -r typecheck

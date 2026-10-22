import { defineConfig } from "vitest/config";
// Each test file boots an in-memory Postgres (PGlite) and runs all migrations; allow for slow CI runners.
export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 30_000 } });

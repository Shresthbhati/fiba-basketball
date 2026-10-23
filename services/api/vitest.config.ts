import { defineConfig } from "vitest/config";
// Each test file boots an in-memory Postgres (PGlite) and runs all migrations.
// Limit thread concurrency to 2 to prevent CPU starvation on multi-core runner.
export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 60_000,
    poolOptions: {
      threads: {
        maxThreads: 2,
        minThreads: 1,
      },
    },
  },
});

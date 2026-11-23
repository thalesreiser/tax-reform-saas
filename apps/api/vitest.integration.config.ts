import { defineConfig } from "vitest/config"

// Database suite (`test:integration`): needs a superuser DATABASE_URL, as in the CI integration job.
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    // One shared database: files run one after the other.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
})

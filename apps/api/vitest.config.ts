import { defineConfig } from "vitest/config"

// Unit tests: no database. The database suite is vitest.integration.config.ts.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**"],
  },
})

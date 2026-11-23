import { defineConfig } from "vitest/config"

// Needs both engines running: ENGINE_REGIME_REGULAR_URL and ENGINE_SIMPLES_NACIONAL_URL.
export default defineConfig({
  test: {
    include: ["tests/engines/**/*.test.ts"],
    testTimeout: 30_000,
  },
})

import { defineConfig } from "vitest/config"

// Unit tests with recorded engine responses. The suite against the running engines is
// vitest.engines.config.ts (engine-images workflow).
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/engines/**"],
  },
})

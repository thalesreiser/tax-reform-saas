import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // The end-to-end suite builds the app once before its first test.
    hookTimeout: 300_000,
    testTimeout: 30_000,
  },
})

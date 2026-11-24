import { defineVitestProject } from "@nuxt/test-utils/config"
import { defineConfig } from "vitest/config"

// Three projects: plain unit tests (Node), component tests in the Nuxt runtime (happy-dom) and the
// end-to-end suite, which builds the app once before its first test.
export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["test/unit/**/*.test.ts"], environment: "node" } },
      await defineVitestProject({
        test: { name: "nuxt", include: ["test/nuxt/**/*.test.ts"], environment: "nuxt" },
      }),
      {
        test: {
          name: "e2e",
          include: ["test/e2e/**/*.test.ts"],
          environment: "node",
          hookTimeout: 300_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
})

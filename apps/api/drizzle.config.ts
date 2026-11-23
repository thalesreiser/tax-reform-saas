import { defineConfig } from "drizzle-kit"

// `pnpm --filter @trs/api db:generate` writes a migration from the schema; no database needed.
// Row-level security, roles and grants go in a custom migration (`db:generate --custom`).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
})

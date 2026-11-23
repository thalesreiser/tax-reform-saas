import { loadMigrationConfig } from "../config.js"
import { runMigrations } from "./migrate.js"

// `pnpm --filter @trs/api db:migrate` (after a build), or `node dist/db/migrate-cli.js` in the image.
const { DATABASE_MIGRATION_URL } = loadMigrationConfig()
if (DATABASE_MIGRATION_URL === undefined) {
  console.error("DATABASE_MIGRATION_URL is not set.")
  process.exit(1)
}
await runMigrations(DATABASE_MIGRATION_URL)
process.stdout.write("Migrations applied.\n")

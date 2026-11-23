import { fileURLToPath } from "node:url"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import pg from "pg"

/** `apps/api/drizzle`, from both `src/db` (tests) and `dist/db` (build and image). */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url))

/**
 * Applies the pending migrations in one transaction. Needs the owner role
 * (`DATABASE_MIGRATION_URL`): it creates tables, the `trs_app` role and the policies.
 */
export async function runMigrations(connectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS_FOLDER })
  } finally {
    await client.end()
  }
}

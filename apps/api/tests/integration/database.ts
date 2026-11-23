import { randomBytes, randomUUID } from "node:crypto"
import pg from "pg"
import { type Db, authDatabase, createDb, withOffice } from "../../src/db/client.js"
import { runMigrations } from "../../src/db/migrate.js"
import { authOrganizations, clients } from "../../src/db/schema.js"

/** Login user of the suite, a member of `trs_app`, like the API's user in each environment. */
export const APP_LOGIN_ROLE = "trs_app_it"

export interface TestDatabase {
  /** Superuser connection: migrations, role set-up and checks that must see every row. */
  admin: pg.Pool
  /** The API's view of the database: `trs_app` membership, row-level security applies. */
  app: Db
  /** Connection string of that login user, for buildApp() in the auth suite. */
  appUrl: string
  /** Raw connection as the application role, for queries that deliberately skip withOffice(). */
  connectAsApp(): Promise<pg.Client>
  close(): Promise<void>
}

/**
 * Migrates the database and creates the login user of the application role. Needs a superuser
 * URL: CI provides it as DATABASE_URL; locally, DATABASE_MIGRATION_URL takes precedence.
 */
export async function setupTestDatabase(): Promise<TestDatabase> {
  const adminUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL
  if (adminUrl === undefined) {
    throw new Error("Integration tests need DATABASE_MIGRATION_URL or DATABASE_URL (superuser).")
  }
  await runMigrations(adminUrl)

  const admin = new pg.Pool({ connectionString: adminUrl, max: 2 })
  const password = randomBytes(24).toString("hex")
  const conn = await admin.connect()
  try {
    const role = conn.escapeIdentifier(APP_LOGIN_ROLE)
    const found = await conn.query("select 1 from pg_catalog.pg_roles where rolname = $1", [
      APP_LOGIN_ROLE,
    ])
    if (found.rowCount === 0) await conn.query(`create role ${role} login in role trs_app`)
    await conn.query(`alter role ${role} password ${conn.escapeLiteral(password)}`)
  } finally {
    conn.release()
  }

  const appUrl = new URL(adminUrl)
  appUrl.username = APP_LOGIN_ROLE
  appUrl.password = password
  const app = createDb(appUrl.toString(), { max: 2 })

  return {
    admin,
    app,
    appUrl: appUrl.toString(),
    async connectAsApp() {
      const client = new pg.Client({ connectionString: appUrl.toString() })
      await client.connect()
      return client
    },
    async close() {
      await app.close()
      await admin.end()
    },
  }
}

/**
 * Creates an office the way better-auth does: an organization row, as the application role; the
 * trigger of 0003_auth_rls.sql creates the office with the same id.
 */
export async function createOffice(db: Db, name: string): Promise<string> {
  const [row] = await authDatabase(db)
    .insert(authOrganizations)
    .values({ name, slug: `office-${randomUUID()}` })
    .returning({ id: authOrganizations.id })
  if (row === undefined) throw new Error("Office was not created.")
  return row.id
}

export async function createClient(
  db: Db,
  officeId: string,
  values: { cnpj: string; legalName: string },
): Promise<string> {
  const [row] = await withOffice(db, officeId, (tx) =>
    tx
      .insert(clients)
      .values({ officeId, ...values })
      .returning({ id: clients.id }),
  )
  if (row === undefined) throw new Error("Client was not created.")
  return row.id
}

/** SQLSTATE of a Postgres error, also when wrapped by Drizzle (`cause`). */
export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error
  while (current instanceof Error) {
    if ("code" in current && typeof current.code === "string") return current.code
    current = current.cause
  }
  return undefined
}

export const INSUFFICIENT_PRIVILEGE = "42501"
export const UNIQUE_VIOLATION = "23505"

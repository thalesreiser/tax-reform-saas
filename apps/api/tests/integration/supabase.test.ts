import pg from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { runMigrations } from "../../src/db/migrate.js"
import { INSUFFICIENT_PRIVILEGE, pgErrorCode } from "./database.js"

// 0006_supabase_hardening.sql against a database prepared the way Supabase prepares one: the Data
// API roles exist and the migration owner's default privileges grant them everything in "public".
// A separate database, so the shared one (where the migrations already ran) is not affected.
const DATABASE = "trs_supabase_it"
const DATA_API_ROLES = ["anon", "authenticated", "service_role"]
const TABLES = [
  "offices",
  "clients",
  "audit_events",
  "auth_users",
  "auth_sessions",
  "auth_accounts",
  "auth_verifications",
  "auth_organizations",
  "auth_members",
  "auth_invitations",
]

const baseUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL
let server: pg.Client | undefined
let db: pg.Client

beforeAll(async () => {
  if (baseUrl === undefined) throw new Error("Integration tests need a superuser DATABASE_URL.")
  const admin = new pg.Client({ connectionString: baseUrl })
  server = admin
  await admin.connect()
  await admin.query(`drop database if exists ${DATABASE} with (force)`)
  await admin.query(`create database ${DATABASE}`)
  for (const role of DATA_API_ROLES) {
    const found = await admin.query("select 1 from pg_catalog.pg_roles where rolname = $1", [role])
    if (found.rowCount === 0) await admin.query(`create role ${role} nologin`)
  }

  const url = new URL(baseUrl)
  url.pathname = `/${DATABASE}`
  const setup = new pg.Client({ connectionString: url.toString() })
  await setup.connect()
  try {
    for (const kind of ["tables", "sequences", "functions"]) {
      await setup.query(
        `alter default privileges in schema public grant all on ${kind} to ${DATA_API_ROLES.join(", ")}`,
      )
    }
  } finally {
    await setup.end()
  }

  await runMigrations(url.toString())
  db = new pg.Client({ connectionString: url.toString() })
  await db.connect()
})

afterAll(async () => {
  await db.end()
  await server?.query(`drop database if exists ${DATABASE} with (force)`)
  await server?.end()
})

async function privileges(role: string, table: string) {
  const res = await db.query<{ granted: boolean }>(
    `select has_table_privilege($1, $2, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE') as granted`,
    [role, `public.${table}`],
  )
  return res.rows[0]?.granted
}

describe("Supabase Data API roles (0006_supabase_hardening.sql)", () => {
  it.each(DATA_API_ROLES.flatMap((role) => TABLES.map((table) => [role, table])))(
    "%s has no privilege on %s",
    async (role, table) => {
      expect(await privileges(role, table)).toBe(false)
    },
  )

  it("rejects a select as anon", async () => {
    await db.query("begin")
    try {
      await db.query("set local role anon")
      const code = await db.query("select * from clients").then(() => "resolved", pgErrorCode)
      expect(code).toBe(INSUFFICIENT_PRIVILEGE)
    } finally {
      await db.query("rollback")
    }
  })

  it("does not grant tables created later to anon or authenticated", async () => {
    await db.query("begin")
    try {
      await db.query("create table public.later_it (id int)")
      expect(await privileges("anon", "later_it")).toBe(false)
      expect(await privileges("authenticated", "later_it")).toBe(false)
    } finally {
      await db.query("rollback")
    }
  })

  it("keeps the application role's grants", async () => {
    const res = await db.query<{ granted: boolean }>(
      "select has_table_privilege('trs_app', 'public.clients', 'SELECT') as granted",
    )
    expect(res.rows[0]?.granted).toBe(true)
  })
})

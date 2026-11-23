import { eq } from "drizzle-orm"
import type pg from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { withOffice } from "../../src/db/client.js"
import { clients, offices } from "../../src/db/schema.js"
import {
  APP_LOGIN_ROLE,
  INSUFFICIENT_PRIVILEGE,
  type TestDatabase,
  UNIQUE_VIOLATION,
  createClient,
  createOffice,
  pgErrorCode,
  setupTestDatabase,
} from "./database.js"

// Fictional data only: test CNPJs and invented names.
const CNPJ = "TEST0000000001"

let db: TestDatabase
let officeA: string
let officeB: string
let clientA: string
let clientB: string

beforeAll(async () => {
  db = await setupTestDatabase()
  officeA = await createOffice(db.app, "Escritório Teste A")
  officeB = await createOffice(db.app, "Escritório Teste B")
  // The same CNPJ may be a client of two offices.
  clientA = await createClient(db.app, officeA, { cnpj: CNPJ, legalName: "Empresa Fictícia A" })
  clientB = await createClient(db.app, officeB, { cnpj: CNPJ, legalName: "Empresa Fictícia B" })
})

afterAll(async () => {
  await db.close()
})

const rejection = (run: Promise<unknown>) => run.then(() => "resolved", pgErrorCode)

async function adminClient(id: string) {
  const res = await db.admin.query<{ legal_name: string; office_id: string }>(
    "select legal_name, office_id from clients where id = $1",
    [id],
  )
  return res.rows[0]
}

async function asApp<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = await db.connectAsApp()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

describe("office isolation (RNF-02)", () => {
  it("lists only the office's own clients", async () => {
    const seenByA = await withOffice(db.app, officeA, (tx) => tx.select().from(clients))
    const seenByB = await withOffice(db.app, officeB, (tx) => tx.select().from(clients))
    expect(seenByA.map((c) => c.id)).toEqual([clientA])
    expect(seenByB.map((c) => c.id)).toEqual([clientB])
  })

  it("does not find another office's client by id", async () => {
    const rows = await withOffice(db.app, officeA, (tx) =>
      tx.select().from(clients).where(eq(clients.id, clientB)),
    )
    expect(rows).toEqual([])
  })

  it("cannot update another office's client", async () => {
    const rows = await withOffice(db.app, officeA, (tx) =>
      tx.update(clients).set({ legalName: "Alterada" }).where(eq(clients.id, clientB)).returning(),
    )
    expect(rows).toEqual([])
    expect(await adminClient(clientB)).toEqual({
      legal_name: "Empresa Fictícia B",
      office_id: officeB,
    })
  })

  it("cannot delete another office's client", async () => {
    const rows = await withOffice(db.app, officeA, (tx) =>
      tx.delete(clients).where(eq(clients.id, clientB)).returning(),
    )
    expect(rows).toEqual([])
    expect(await adminClient(clientB)).toBeDefined()
  })

  it("rejects inserting a client for another office", async () => {
    const run = withOffice(db.app, officeA, (tx) =>
      tx.insert(clients).values({ officeId: officeB, cnpj: "TEST0000000002", legalName: "X" }),
    )
    expect(await rejection(run)).toBe(INSUFFICIENT_PRIVILEGE)
  })

  it("rejects moving its own client to another office", async () => {
    const run = withOffice(db.app, officeA, (tx) =>
      tx.update(clients).set({ officeId: officeB }).where(eq(clients.id, clientA)),
    )
    expect(await rejection(run)).toBe(INSUFFICIENT_PRIVILEGE)
    expect((await adminClient(clientA))?.office_id).toBe(officeA)
  })

  it("rejects a duplicate CNPJ within the same office", async () => {
    const run = createClient(db.app, officeA, { cnpj: CNPJ, legalName: "Duplicada" })
    expect(await rejection(run)).toBe(UNIQUE_VIOLATION)
  })

  it("sees and renames only its own office", async () => {
    const seen = await withOffice(db.app, officeA, (tx) => tx.select().from(offices))
    expect(seen.map((o) => o.id)).toEqual([officeA])
    const renamed = await withOffice(db.app, officeA, (tx) =>
      tx.update(offices).set({ name: "Outro" }).where(eq(offices.id, officeB)).returning(),
    )
    expect(renamed).toEqual([])
  })
})

describe("without an office setting", () => {
  it("reads zero rows and cannot write", async () => {
    await asApp(async (client) => {
      const counts = await client.query<{ clients: number; offices: number }>(
        "select (select count(*) from clients)::int as clients, (select count(*) from offices)::int as offices",
      )
      expect(counts.rows[0]).toEqual({ clients: 0, offices: 0 })
      const insert = client.query(
        "insert into clients (office_id, cnpj, legal_name) values ($1, 'TEST0000000003', 'X')",
        [officeA],
      )
      expect(await rejection(insert)).toBe(INSUFFICIENT_PRIVILEGE)
    })
  })

  it("does not keep the office after the transaction ends on the same connection", async () => {
    await asApp(async (client) => {
      const count = async () =>
        (await client.query<{ n: number }>("select count(*)::int as n from clients")).rows[0]?.n
      await client.query("begin")
      await client.query("select set_config('app.office_id', $1, true)", [officeA])
      expect(await count()).toBe(1)
      await client.query("commit")
      expect(await count()).toBe(0)
    })
  })
})

describe("application role", () => {
  it("is not a superuser, cannot bypass RLS and owns no table", async () => {
    const roles = await db.admin.query<{
      rolname: string
      rolsuper: boolean
      rolbypassrls: boolean
    }>(
      "select rolname, rolsuper, rolbypassrls from pg_catalog.pg_roles where rolname = any($1) order by rolname",
      [["trs_app", APP_LOGIN_ROLE]],
    )
    expect(roles.rows).toEqual([
      { rolname: "trs_app", rolsuper: false, rolbypassrls: false },
      { rolname: APP_LOGIN_ROLE, rolsuper: false, rolbypassrls: false },
    ])
    const owned = await db.admin.query(
      "select tablename from pg_catalog.pg_tables where tableowner = any($1)",
      [["trs_app", APP_LOGIN_ROLE]],
    )
    expect(owned.rows).toEqual([])
  })

  it("cannot turn row security off, disable it or switch to the owner", async () => {
    const owner = (await db.admin.query<{ u: string }>("select current_user as u")).rows[0]?.u ?? ""
    await asApp(async (client) => {
      await client.query("set row_security = off")
      expect(await rejection(client.query("select * from clients"))).toBe(INSUFFICIENT_PRIVILEGE)
      await client.query("reset row_security")
      const disable = client.query("alter table clients disable row level security")
      expect(await rejection(disable)).toBe(INSUFFICIENT_PRIVILEGE)
      const setRole = client.query(`set role ${client.escapeIdentifier(owner)}`)
      expect(await rejection(setRole)).toBe(INSUFFICIENT_PRIVILEGE)
    })
  })
})

// Guard for future migrations: a new table must get FORCE ROW LEVEL SECURITY and a policy (see
// README "Database"), or be listed here, deliberately, as not tenant-scoped.
const NON_TENANT_TABLES: string[] = []

describe("every table in the public schema", () => {
  it("forces row-level security with a policy", async () => {
    const tables = await db.admin.query<{
      name: string
      rls: boolean
      forced: boolean
      policies: number
    }>(
      `select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as forced,
              (select count(*) from pg_catalog.pg_policy p where p.polrelid = c.oid)::int as policies
         from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') order by c.relname`,
    )
    const names = tables.rows.map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(["clients", "offices"]))
    const unprotected = tables.rows
      .filter((t) => !NON_TENANT_TABLES.includes(t.name))
      .filter((t) => !t.rls || !t.forced || t.policies === 0)
      .map((t) => t.name)
    expect(unprotected).toEqual([])
  })
})

import { randomUUID } from "node:crypto"
import type pg from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { ZodError } from "zod"
import { type AuditEvent, recordAudit } from "../../src/audit/events.js"
import { withOffice } from "../../src/db/client.js"
import { auditEvents, clients } from "../../src/db/schema.js"
import {
  INSUFFICIENT_PRIVILEGE,
  type TestDatabase,
  createOffice,
  pgErrorCode,
  setupTestDatabase,
} from "./database.js"

// Fictional data only.
let db: TestDatabase
let officeA: string
let officeB: string
const actor = { userId: randomUUID(), role: "owner" as const }

/** How BE-02.2 records a client mutation: the event in the same transaction as the write. */
async function createClientAudited(officeId: string, cnpj: string, fail = false): Promise<string> {
  return withOffice(db.app, officeId, async (tx) => {
    const [row] = await tx
      .insert(clients)
      .values({ officeId, cnpj, legalName: "Empresa Fictícia" })
      .returning({ id: clients.id })
    if (row === undefined) throw new Error("Client was not created.")
    await recordAudit(tx, {
      action: "client.created",
      resourceId: row.id,
      metadata: {},
      actor,
      requestId: randomUUID(),
    })
    if (fail) throw new Error("rolled back")
    return row.id
  })
}

const eventsOf = (officeId: string) =>
  withOffice(db.app, officeId, (tx) => tx.select().from(auditEvents))

async function adminEvents(resourceId: string) {
  const res = await db.admin.query("select * from audit_events where resource_id = $1", [
    resourceId,
  ])
  return res.rows
}

const rejection = (run: Promise<unknown>) => run.then(() => "resolved", pgErrorCode)

async function asApp<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = await db.connectAsApp()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

let clientA: string

beforeAll(async () => {
  db = await setupTestDatabase()
  officeA = await createOffice(db.app, "Escritório Auditoria A")
  officeB = await createOffice(db.app, "Escritório Auditoria B")
  clientA = await createClientAudited(officeA, "TEST0000000021")
  await createClientAudited(officeB, "TEST0000000022")
})

afterAll(async () => {
  await db.close()
})

describe("recordAudit (RF-18)", () => {
  it("writes the event with the transaction's office, actor and time", async () => {
    const [event] = await adminEvents(clientA)
    expect(event).toMatchObject({
      office_id: officeA,
      actor_user_id: actor.userId,
      actor_role: "owner",
      action: "client.created",
      resource_type: "client",
      metadata: {},
    })
    expect(event?.occurred_at).toBeInstanceOf(Date)
  })

  it("leaves no event when the action rolls back", async () => {
    const cnpj = "TEST0000000023"
    await expect(createClientAudited(officeA, cnpj, true)).rejects.toThrow("rolled back")
    const found = await db.admin.query(
      `select 1 from audit_events e where e.office_id = $1 and e.resource_id not in
         (select id from clients) and e.action = 'client.created'`,
      [officeA],
    )
    expect(found.rowCount).toBe(0)
    const client = await db.admin.query("select 1 from clients where cnpj = $1", [cnpj])
    expect(client.rowCount).toBe(0)
  })

  it("rejects metadata outside the allow-list and writes nothing", async () => {
    const resourceId = randomUUID()
    const run = withOffice(db.app, officeA, (tx) =>
      recordAudit(tx, {
        action: "client.deleted",
        resourceId,
        metadata: { cnpj: "TEST0000000024" },
        actor,
        requestId: null,
      } as unknown as AuditEvent),
    )
    await expect(run).rejects.toBeInstanceOf(ZodError)
    expect(await adminEvents(resourceId)).toEqual([])
  })
})

describe("audit isolation and append-only", () => {
  it("lets an office read only its own events", async () => {
    const a = await eventsOf(officeA)
    const b = await eventsOf(officeB)
    expect(a.length).toBeGreaterThan(0)
    expect(b.length).toBeGreaterThan(0)
    expect(a.every((e) => e.officeId === officeA)).toBe(true)
    expect(b.every((e) => e.officeId === officeB)).toBe(true)
  })

  it("reads zero events without an office and cannot write one for another office", async () => {
    await asApp(async (client) => {
      const n = await client.query<{ n: number }>("select count(*)::int as n from audit_events")
      expect(n.rows[0]?.n).toBe(0)
      await client.query("begin")
      await client.query("select set_config('app.office_id', $1, true)", [officeA])
      const insert = client.query(
        `insert into audit_events (office_id, action, resource_type, resource_id)
         values ($1, 'client.deleted', 'client', $2)`,
        [officeB, randomUUID()],
      )
      expect(await rejection(insert)).toBe(INSUFFICIENT_PRIVILEGE)
      await client.query("rollback")
    })
  })

  it("does not let the API role update, delete or truncate events", async () => {
    await asApp(async (client) => {
      await client.query("begin")
      await client.query("select set_config('app.office_id', $1, true)", [officeA])
      for (const statement of [
        "update audit_events set actor_user_id = null",
        "delete from audit_events",
        "truncate audit_events",
      ]) {
        await client.query("savepoint s")
        expect(await rejection(client.query(statement))).toBe(INSUFFICIENT_PRIVILEGE)
        await client.query("rollback to savepoint s")
      }
      await client.query("rollback")
    })
  })

  it("rejects changes even from the owner role (trigger)", async () => {
    for (const statement of [
      "update audit_events set actor_role = 'accountant' where resource_id = $1",
      "delete from audit_events where resource_id = $1",
    ]) {
      expect(await rejection(db.admin.query(statement, [clientA]))).toBe(INSUFFICIENT_PRIVILEGE)
    }
    expect(await rejection(db.admin.query("truncate audit_events"))).toBe(INSUFFICIENT_PRIVILEGE)
    expect(await adminEvents(clientA)).toHaveLength(1)
  })

  it("keeps metadata a small object", async () => {
    for (const metadata of ['"text"', JSON.stringify({ pad: "x".repeat(2000) })]) {
      const insert = db.admin.query(
        `insert into audit_events (office_id, action, resource_type, resource_id, metadata)
         values ($1, 'client.deleted', 'client', $2, $3::jsonb)`,
        [officeA, randomUUID(), metadata],
      )
      expect(await rejection(insert)).toBe("23514")
    }
  })
})

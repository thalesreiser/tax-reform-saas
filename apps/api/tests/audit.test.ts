import { afterEach, describe, expect, it } from "vitest"
import { ZodError, z } from "zod"
import { type App, buildApp } from "../src/app.js"
import { AUDIT_METADATA, type AuditEvent, auditMetadata, recordAudit } from "../src/audit/events.js"
import { loadConfig } from "../src/config.js"
import type { OfficeTx } from "../src/db/client.js"
import { AUDIT_ACTIONS, type AuditAction } from "../src/db/schema.js"
import { decodeCursor, encodeCursor } from "../src/routes/audit.js"
import { TEST_ENV } from "./env.js"

const ID = "7d1f9a52-3c64-4c1e-9a8e-2f5b6c7d8e9f"

/** A valid metadata object for each action. */
const VALID: Record<AuditAction, Record<string, unknown>> = {
  "office.created": {},
  "office.updated": { fields: ["name"] },
  "member.invited": { role: "accountant" },
  "member.invitation_canceled": {},
  "member.invitation_resent": {},
  "member.invitation_rejected": {},
  "member.joined": { role: "accountant", invitationId: ID },
  "member.role_changed": { from: "accountant", to: "owner" },
  "member.removed": { role: "accountant" },
  "member.left": { role: "accountant" },
  "client.created": {},
  "client.updated": { fields: ["legalName"] },
  "client.deleted": {},
}

// Personal or fiscal data that must never reach the log, whatever the action.
const FORBIDDEN = {
  email: "pessoa@example.test",
  name: "Pessoa Teste",
  cnpj: "TEST0000000001",
  legalName: "Empresa Fictícia",
  revenue: "1000.00",
}

describe("audit metadata allow-list", () => {
  it.each(AUDIT_ACTIONS)("accepts the documented metadata of %s", (action) => {
    expect(auditMetadata(action, VALID[action])).toEqual(VALID[action])
  })

  it.each(AUDIT_ACTIONS)("rejects personal or fiscal keys in %s", (action) => {
    for (const [key, value] of Object.entries(FORBIDDEN)) {
      expect(() => auditMetadata(action, { ...VALID[action], [key]: value })).toThrow(ZodError)
    }
  })

  it("rejects free text in place of a role or field name", () => {
    expect(() => auditMetadata("member.invited", { role: "pessoa@example.test" })).toThrow(ZodError)
    expect(() => auditMetadata("client.updated", { fields: ["Empresa Fictícia"] })).toThrow(
      ZodError,
    )
  })

  // Guard for new actions: only enums, uuids and lists of enums, so no value can be free text.
  it.each(AUDIT_ACTIONS)("declares %s with closed values only", (action) => {
    const closed = (schema: z.ZodType): boolean => {
      if (schema instanceof z.ZodOptional) return closed(schema.unwrap() as z.ZodType)
      if (schema instanceof z.ZodArray) return schema.element instanceof z.ZodEnum
      return schema instanceof z.ZodEnum || schema instanceof z.ZodUUID
    }
    const shape = AUDIT_METADATA[action].shape as Record<string, z.ZodType>
    for (const [key, field] of Object.entries(shape)) {
      expect({ key, closed: closed(field) }).toEqual({ key, closed: true })
      expect(Object.keys(FORBIDDEN)).not.toContain(key)
    }
  })
})

describe("recordAudit", () => {
  // Validation runs before the transaction is touched: this fake fails on any use.
  const tx = new Proxy(
    {},
    {
      get() {
        throw new Error("transaction used")
      },
    },
  ) as unknown as OfficeTx
  const event = {
    action: "member.invited",
    resourceId: ID,
    metadata: { role: "accountant" },
    actor: { userId: ID, role: "owner" },
    requestId: ID,
  } satisfies AuditEvent

  it.each([
    { ...event, metadata: { role: "accountant", email: FORBIDDEN.email } },
    { ...event, resourceId: "not-a-uuid" },
    { ...event, requestId: "client-chosen" },
    { ...event, action: "key.stolen" },
  ])("rejects an invalid event before writing (%#)", async (bad) => {
    await expect(recordAudit(tx, bad as unknown as AuditEvent)).rejects.toBeInstanceOf(ZodError)
  })
})

describe("audit cursor", () => {
  it("round-trips the time and id", () => {
    const at = new Date("2026-11-23T12:34:56.789Z")
    expect(decodeCursor(encodeCursor(at, ID))).toEqual({ at, id: ID })
  })

  it.each(["", "abc", Buffer.from('["x","y"]').toString("base64url")])("rejects %j", (cursor) => {
    expect(decodeCursor(cursor)).toBeUndefined()
  })
})

describe("GET /office/audit", () => {
  let app: App | undefined
  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  it("answers 401 without a session and is in the OpenAPI document", async () => {
    app = await buildApp(loadConfig(TEST_ENV))
    await app.ready()
    expect((await app.inject({ method: "GET", url: "/office/audit" })).statusCode).toBe(401)
    const doc = (await app.inject({ method: "GET", url: "/openapi.json" })).json<{
      paths: Record<string, unknown>
    }>()
    expect(Object.keys(doc.paths)).toContain("/office/audit")
  })
})

import { randomBytes, randomUUID } from "node:crypto"
import type { LightMyRequestResponse as InjectResponse } from "fastify"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { type App, buildApp } from "../../src/app.js"
import { MemoryMailer } from "../../src/auth/mailer.js"
import { loadConfig } from "../../src/config.js"
import { withOffice } from "../../src/db/client.js"
import { officeLogos } from "../../src/db/schema.js"
import { invitationSchema, memberSchema } from "../../src/routes/members.js"
import { officeSettingsSchema } from "../../src/routes/office-settings.js"
import { type TestDatabase, setupTestDatabase } from "./database.js"

// Fictional people, offices and a generated CNPJ only; e-mails use the reserved .test domain.
const BASE_URL = "http://localhost:3000"
const PASSWORD = "senha-de-teste-123"
const OFFICE_CNPJ = "11222333000181"

let db: TestDatabase
let app: App
const mailer = new MemoryMailer()

beforeAll(async () => {
  db = await setupTestDatabase()
  app = await buildApp(
    loadConfig({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL: db.appUrl,
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      BETTER_AUTH_URL: BASE_URL,
    }),
    { mailer },
  )
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await db.close()
})

let ipCounter = 0
const nextIp = () => {
  ipCounter += 1
  return `10.200.${ipCounter % 250}.${Math.floor(ipCounter / 250) + 1}`
}

type Method = "GET" | "POST" | "PATCH" | "DELETE"

function call(
  method: Method,
  url: string,
  cookie?: string,
  body?: object,
  headers: Record<string, string> = {},
): Promise<InjectResponse> {
  return app.inject({
    method,
    url,
    remoteAddress: nextIp(),
    headers: { origin: BASE_URL, ...(cookie ? { cookie } : {}), ...headers },
    ...(body ? { payload: body } : {}),
  })
}

const uniqueEmail = (who: string) => `${who}.${randomUUID().slice(0, 8)}@example.test`
const cookieOf = (res: InjectResponse) => res.cookies.map((c) => `${c.name}=${c.value}`).join("; ")

function linkIn(email: string, pattern: RegExp): string {
  const match = pattern.exec(mailer.last(email)?.text ?? "")
  if (match === null) throw new Error(`No link for ${email}`)
  return match[0]
}

async function user(email: string): Promise<string> {
  const signUp = await call("POST", "/api/auth/sign-up/email", undefined, {
    email,
    password: PASSWORD,
    name: "Pessoa Teste",
  })
  expect(signUp.statusCode).toBe(200)
  const url = new URL(linkIn(email, /http\S+\/verify-email\?\S+/))
  expect([200, 302]).toContain((await call("GET", `${url.pathname}${url.search}`)).statusCode)
  const res = await call("POST", "/api/auth/sign-in/email", undefined, {
    email,
    password: PASSWORD,
  })
  expect(res.statusCode).toBe(200)
  return cookieOf(res)
}

async function createOffice(cookie: string, name: string): Promise<string> {
  const res = await call("POST", "/api/auth/organization/create", cookie, {
    name,
    slug: `escritorio-${randomUUID()}`,
  })
  expect(res.statusCode).toBe(200)
  return res.json<{ id: string }>().id
}

const invitationIdFor = (email: string) => linkIn(email, /\/convites\/([0-9a-f-]{36})/).slice(-36)

async function invite(owner: string, officeId: string, email: string) {
  const res = await call("POST", "/api/auth/organization/invite-member", owner, {
    email,
    role: "accountant",
    organizationId: officeId,
  })
  expect(res.statusCode).toBe(200)
  return invitationIdFor(email)
}

/** A new accountant of the office; returns the session cookie. */
async function accountantOf(owner: string, officeId: string): Promise<string> {
  const email = uniqueEmail("contador")
  const invitationId = await invite(owner, officeId, email)
  const cookie = await user(email)
  const res = await call("POST", "/api/auth/organization/accept-invitation", cookie, {
    invitationId,
  })
  expect(res.statusCode).toBe(200)
  return cookie
}

async function members(cookie: string) {
  const res = await call("GET", "/v1/office/members", cookie)
  expect(res.statusCode).toBe(200)
  return res.json<{ items: unknown[] }>().items.map((m) => memberSchema.parse(m))
}

async function events(officeId: string, action: string) {
  const res = await db.admin.query<{ resource_id: string; metadata: unknown; actor_role: string }>(
    "select resource_id, metadata, actor_role from audit_events where office_id = $1 and action = $2 order by occurred_at",
    [officeId, action],
  )
  return res.rows
}

function png(width: number, height: number, seed = 0): Buffer {
  const ihdr = Buffer.alloc(25)
  ihdr.writeUInt32BE(13, 0)
  ihdr.write("IHDR", 4, "latin1")
  ihdr.writeUInt32BE(width, 8)
  ihdr.writeUInt32BE(height, 12)
  ihdr[24] = seed
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr])
}

function upload(cookie: string, data: Buffer, type = "image/png") {
  return app.inject({
    method: "POST",
    url: "/v1/office/logo",
    remoteAddress: nextIp(),
    headers: { origin: BASE_URL, cookie, "content-type": type },
    payload: data,
  })
}

describe("office settings (BE-02.1)", () => {
  let owner: string
  let accountant: string
  let officeId: string

  beforeAll(async () => {
    owner = await user(uniqueEmail("dona-config"))
    officeId = await createOffice(owner, "Escritório Configurações")
    accountant = await accountantOf(owner, officeId)
  })

  it("lets any member read the settings", async () => {
    const res = await call("GET", "/v1/office", accountant)
    expect(res.statusCode).toBe(200)
    expect(officeSettingsSchema.parse(res.json())).toMatchObject({
      id: officeId,
      name: "Escritório Configurações",
      role: "accountant",
      cnpj: null,
      brandColor: null,
      brandContrast: null,
      logo: null,
    })
  })

  it("lets the owner change the profile, renames the organization and audits field names", async () => {
    const res = await call("PATCH", "/v1/office", owner, {
      name: "Escritório Renomeado",
      cnpj: "11.222.333/0001-81",
      contactEmail: "contato@example.test",
      brandColor: "#1a2b3c",
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      name: "Escritório Renomeado",
      cnpj: OFFICE_CNPJ,
      contactEmail: "contato@example.test",
      brandColor: "#1A2B3C",
      brandContrast: { meetsAaOnWhite: true, meetsAaOnBlack: false },
    })
    const org = await db.admin.query("select name from auth_organizations where id = $1", [
      officeId,
    ])
    expect(org.rows).toEqual([{ name: "Escritório Renomeado" }])
    const [event] = await events(officeId, "office.updated")
    expect(event?.metadata).toEqual({ fields: ["name", "cnpj", "contactEmail", "brandColor"] })
    expect(JSON.stringify(event)).not.toContain("example.test")
  })

  it("rejects an invalid CNPJ or colour and an accountant's change", async () => {
    expect((await call("PATCH", "/v1/office", owner, { cnpj: "11222333000182" })).statusCode).toBe(
      400,
    )
    expect((await call("PATCH", "/v1/office", owner, { brandColor: "red" })).statusCode).toBe(400)
    const res = await call("PATCH", "/v1/office", accountant, { name: "Tomado" })
    expect(res.statusCode).toBe(403)
  })

  it("stores the logo, serves it with an ETag and answers 304 when unchanged", async () => {
    const image = png(120, 60)
    const res = await upload(owner, image)
    expect(res.statusCode).toBe(200)
    const logo = officeSettingsSchema.parse(res.json()).logo
    expect(logo).toMatchObject({ contentType: "image/png", width: 120, height: 60 })

    const got = await call("GET", "/v1/office/logo", accountant)
    expect(got.statusCode).toBe(200)
    expect(got.headers["content-type"]).toBe("image/png")
    expect(got.headers.etag).toBe(logo?.etag)
    expect(got.headers["cache-control"]).toBe("private, no-cache")
    expect(got.rawPayload.equals(image)).toBe(true)
    const again = await call("GET", "/v1/office/logo", accountant, undefined, {
      "if-none-match": String(got.headers.etag),
    })
    expect(again.statusCode).toBe(304)

    const replaced = await upload(owner, png(120, 60, 1))
    expect(officeSettingsSchema.parse(replaced.json()).logo?.etag).not.toBe(logo?.etag)
    expect((await events(officeId, "office.updated")).at(-1)?.metadata).toEqual({
      fields: ["logo"],
    })
  })

  it("rejects SVG, mismatched types, oversized files and accountants", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>x()</script></svg>')
    expect((await upload(owner, svg, "image/svg+xml")).statusCode).toBe(415)
    expect((await upload(owner, svg, "image/png")).statusCode).toBe(415)
    expect((await upload(owner, png(100, 100), "image/webp")).statusCode).toBe(415)
    const big = Buffer.concat([png(100, 100), Buffer.alloc(200 * 1024)])
    expect((await upload(owner, big)).statusCode).toBe(413)
    expect((await upload(accountant, png(100, 100))).statusCode).toBe(403)
  })

  it("keeps each office's logo to itself (row-level security)", async () => {
    const other = await createOffice(await user(uniqueEmail("dona-outra")), "Outro Escritório")
    const rows = await withOffice(db.app, other, (tx) => tx.select().from(officeLogos))
    expect(rows).toEqual([])
    const own = await withOffice(db.app, officeId, (tx) => tx.select().from(officeLogos))
    expect(own.map((r) => r.officeId)).toEqual([officeId])
  })

  it("removes the logo", async () => {
    expect((await call("DELETE", "/v1/office/logo", owner)).statusCode).toBe(204)
    expect((await call("GET", "/v1/office/logo", owner)).statusCode).toBe(404)
  })
})

describe("members and invitations (BE-02.1)", () => {
  let owner: string
  let officeId: string

  beforeAll(async () => {
    owner = await user(uniqueEmail("dona-membros"))
    officeId = await createOffice(owner, "Escritório Membros")
  })

  it("lists members to any member", async () => {
    const accountant = await accountantOf(owner, officeId)
    const list = await members(accountant)
    expect(list.map((m) => m.role)).toEqual(["owner", "accountant"])
  })

  it("revokes access immediately when the owner removes a member", async () => {
    const accountant = await accountantOf(owner, officeId)
    expect((await call("GET", "/v1/office", accountant)).statusCode).toBe(200)
    const me = (await call("GET", "/v1/office", accountant)).json<{ id: string }>()
    expect(me.id).toBe(officeId)
    const target = (await members(owner)).at(-1)
    if (target === undefined) throw new Error("No member")

    expect((await call("DELETE", `/v1/office/members/${target.id}`, accountant)).statusCode).toBe(
      403,
    )
    expect((await call("DELETE", `/v1/office/members/${target.id}`, owner)).statusCode).toBe(204)
    expect((await call("GET", "/v1/office", accountant)).statusCode).toBe(403)
    expect((await call("GET", "/v1/clients", accountant)).statusCode).toBe(403)
    const [removed] = await events(officeId, "member.removed")
    expect(removed).toMatchObject({ resource_id: target.id, metadata: { role: "accountant" } })
  })

  it("changes roles but never leaves the office without an owner", async () => {
    await accountantOf(owner, officeId)
    const list = await members(owner)
    const self = list.find((m) => m.role === "owner")
    const other = list.find((m) => m.role === "accountant")
    if (self === undefined || other === undefined) throw new Error("Members missing")

    const demote = await call("PATCH", `/v1/office/members/${self.id}`, owner, {
      role: "accountant",
    })
    expect(demote.statusCode).toBe(409)
    expect((await call("DELETE", `/v1/office/members/${self.id}`, owner)).statusCode).toBe(409)

    const promote = await call("PATCH", `/v1/office/members/${other.id}`, owner, { role: "owner" })
    expect(promote.statusCode).toBe(204)
    const [changed] = await events(officeId, "member.role_changed")
    expect(changed?.metadata).toEqual({ from: "accountant", to: "owner" })
    expect((await members(owner)).find((m) => m.id === other.id)?.role).toBe("owner")
  })

  it("answers 404 for a member of another office", async () => {
    const otherOwner = await user(uniqueEmail("dona-alheia"))
    await createOffice(otherOwner, "Escritório Alheio")
    const [foreign] = await members(otherOwner)
    if (foreign === undefined) throw new Error("No member")
    expect((await call("DELETE", `/v1/office/members/${foreign.id}`, owner)).statusCode).toBe(404)
  })

  it("lists, resends and cancels invitations (owner only), all audited", async () => {
    const email = uniqueEmail("convidada")
    const invitationId = await invite(owner, officeId, email)
    const accountant = await accountantOf(owner, officeId)
    expect((await call("GET", "/v1/office/invitations", accountant)).statusCode).toBe(403)

    const list = await call("GET", "/v1/office/invitations", owner)
    expect(list.statusCode).toBe(200)
    const items = list.json<{ items: unknown[] }>().items.map((i) => invitationSchema.parse(i))
    expect(items.map((i) => i.id)).toContain(invitationId)

    const sent = mailer.sent.length
    const resend = await call("POST", `/v1/office/invitations/${invitationId}/resend`, owner)
    expect(resend.statusCode).toBe(204)
    expect(mailer.sent.length).toBe(sent + 1)
    expect(mailer.last(email)?.text).toContain(invitationId)
    expect(await events(officeId, "member.invitation_resent")).toMatchObject([
      { resource_id: invitationId, metadata: {}, actor_role: "owner" },
    ])

    const cancel = await call("DELETE", `/v1/office/invitations/${invitationId}`, owner)
    expect(cancel.statusCode).toBe(204)
    expect(
      (await events(officeId, "member.invitation_canceled")).map((e) => e.resource_id),
    ).toContain(invitationId)
    expect((await call("DELETE", `/v1/office/invitations/${invitationId}`, owner)).statusCode).toBe(
      404,
    )
  })
})

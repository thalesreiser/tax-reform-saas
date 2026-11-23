import { randomBytes, randomUUID } from "node:crypto"
import type { LightMyRequestResponse as InjectResponse } from "fastify"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { type App, buildApp } from "../../src/app.js"
import { CREDENTIAL_LIMITS, currentOffice } from "../../src/auth/plugin.js"
import { MemoryMailer } from "../../src/auth/mailer.js"
import { loadConfig } from "../../src/config.js"
import { withOffice } from "../../src/db/client.js"
import { clients } from "../../src/db/schema.js"
import { problemSchema } from "../../src/problem.js"
import { type TestDatabase, createClient, setupTestDatabase } from "./database.js"

// Fictional people and offices only; addresses use the reserved .test domain.
const BASE_URL = "http://localhost:3000"
const PASSWORD = "senha-de-teste-123"

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
  // Tenant data read through the bridge: the office comes from the session, RLS does the rest.
  app.get("/test/clients", { preHandler: app.requireOffice }, (request) =>
    withOffice(db.app, currentOffice(request).id, (tx) =>
      tx.select({ id: clients.id }).from(clients),
    ),
  )
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await db.close()
})

let ipCounter = 0
/** Each test gets its own client IP, so the per-IP limits of one never affect another. */
const nextIp = () => {
  ipCounter += 1
  return `10.${Math.floor(ipCounter / 250)}.${ipCounter % 250}.1`
}

function call(
  method: "GET" | "POST",
  url: string,
  options: { body?: object; cookie?: string; ip?: string } = {},
): Promise<InjectResponse> {
  return app.inject({
    method,
    url,
    remoteAddress: options.ip ?? nextIp(),
    headers: { origin: BASE_URL, ...(options.cookie ? { cookie: options.cookie } : {}) },
    ...(options.body ? { payload: options.body } : {}),
  })
}

const uniqueEmail = (who: string) => `${who}.${randomUUID().slice(0, 8)}@example.test`

function linkIn(email: string, pattern: RegExp): string {
  const text = mailer.last(email)?.text ?? ""
  const match = pattern.exec(text)
  if (match === null) throw new Error(`No link for ${email}`)
  return match[0]
}

async function signUp(email: string): Promise<InjectResponse> {
  return call("POST", "/api/auth/sign-up/email", {
    body: { email, password: PASSWORD, name: "Pessoa Teste" },
  })
}

async function verify(email: string): Promise<void> {
  const url = new URL(linkIn(email, /http\S+\/verify-email\?\S+/))
  const res = await call("GET", `${url.pathname}${url.search}`)
  expect([200, 302]).toContain(res.statusCode)
}

async function signIn(email: string, password = PASSWORD, ip?: string) {
  return call("POST", "/api/auth/sign-in/email", {
    body: { email, password },
    ...(ip ? { ip } : {}),
  })
}

const cookieOf = (res: InjectResponse) => res.cookies.map((c) => `${c.name}=${c.value}`).join("; ")

/** A verified, signed-in user; returns the session cookie. */
async function user(email: string): Promise<string> {
  expect((await signUp(email)).statusCode).toBe(200)
  await verify(email)
  const res = await signIn(email)
  expect(res.statusCode).toBe(200)
  return cookieOf(res)
}

async function createOffice(cookie: string, name: string): Promise<string> {
  const res = await call("POST", "/api/auth/organization/create", {
    cookie,
    body: { name, slug: `escritorio-${randomUUID()}` },
  })
  expect(res.statusCode).toBe(200)
  return res.json<{ id: string }>().id
}

async function invite(cookie: string, officeId: string, email: string, role: string) {
  return call("POST", "/api/auth/organization/invite-member", {
    cookie,
    body: { email, role, organizationId: officeId },
  })
}

const invitationIdFor = (email: string) => linkIn(email, /\/convites\/([0-9a-f-]{36})/).slice(-36)

async function accept(cookie: string, invitationId: string) {
  return call("POST", "/api/auth/organization/accept-invitation", {
    cookie,
    body: { invitationId },
  })
}

async function officeOf(cookie: string) {
  return call("GET", "/office", { cookie })
}

async function memberRole(officeId: string, email: string) {
  const res = await db.admin.query<{ role: string }>(
    `select m.role from auth_members m join auth_users u on u.id = m.user_id
      where m.organization_id = $1 and u.email = $2`,
    [officeId, email],
  )
  return res.rows[0]?.role
}

describe("sign-up and sign-in", () => {
  it("creates the user with a normalised e-mail and requires verification", async () => {
    const email = uniqueEmail("Dona.Owner")
    const res = await signUp(email.toUpperCase())
    expect(res.statusCode).toBe(200)
    const stored = await db.admin.query<{ email: string; email_verified: boolean }>(
      "select email, email_verified from auth_users where email = $1",
      [email.toLowerCase()],
    )
    expect(stored.rows).toEqual([{ email: email.toLowerCase(), email_verified: false }])

    const before = await signIn(email)
    expect(before.statusCode).toBe(403)
    await verify(email.toLowerCase())
    const after = await signIn(email)
    expect(after.statusCode).toBe(200)
    const session = after.cookies.find((c) => c.name.endsWith("session_token"))
    expect(session).toMatchObject({ httpOnly: true, sameSite: "Lax" })
  })

  it("rejects a password shorter than 10 characters", async () => {
    const res = await call("POST", "/api/auth/sign-up/email", {
      body: { email: uniqueEmail("curta"), password: "123456789", name: "Pessoa Teste" },
    })
    expect(res.statusCode).toBe(400)
  })

  it("does not reveal whether an e-mail exists", async () => {
    const email = uniqueEmail("existente")
    await user(email)

    const wrongPassword = await signIn(email, "senha-errada-123")
    const unknownEmail = await signIn(uniqueEmail("desconhecido"), "senha-errada-123")
    expect(wrongPassword.statusCode).toBe(401)
    expect(unknownEmail.statusCode).toBe(401)
    const { requestId: _a, ...a } = problemSchema.parse(wrongPassword.json())
    const { requestId: _b, ...b } = problemSchema.parse(unknownEmail.json())
    expect(a).toEqual(b)

    const again = await signUp(email)
    const fresh = await signUp(uniqueEmail("novo"))
    expect(again.statusCode).toBe(fresh.statusCode)
    expect(Object.keys(again.json<object>())).toEqual(Object.keys(fresh.json<object>()))
    const count = await db.admin.query("select 1 from auth_users where email = $1", [email])
    expect(count.rowCount).toBe(1)
  })

  it("answers 429 after too many failed sign-ins for one e-mail", async () => {
    const email = uniqueEmail("alvo")
    await user(email)
    for (let i = 0; i < CREDENTIAL_LIMITS.perEmail; i++) {
      expect((await signIn(email, "senha-errada-123")).statusCode).toBe(401)
    }
    const limited = await signIn(email)
    expect(limited.statusCode).toBe(429)
    expect(problemSchema.parse(limited.json()).status).toBe(429)
  })

  it("answers 429 after too many sign-ins from one IP", async () => {
    const ip = nextIp()
    for (let i = 0; i < CREDENTIAL_LIMITS.perIp; i++) {
      expect((await signIn(uniqueEmail("varios"), "senha-errada-123", ip)).statusCode).toBe(401)
    }
    expect((await signIn(uniqueEmail("varios"), "senha-errada-123", ip)).statusCode).toBe(429)
  })
})

describe("offices and invitations (RF-01)", () => {
  let ownerEmail: string
  let owner: string
  let officeA: string

  beforeAll(async () => {
    ownerEmail = uniqueEmail("dona")
    owner = await user(ownerEmail)
    officeA = await createOffice(owner, "Escritório Teste A")
  })

  it("creates the office with the organization's id and the creator as owner", async () => {
    const office = await db.admin.query<{ name: string }>(
      "select name from offices where id = $1",
      [officeA],
    )
    expect(office.rows).toEqual([{ name: "Escritório Teste A" }])
    expect(await memberRole(officeA, ownerEmail)).toBe("owner")
    const res = await officeOf(owner)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ id: officeA, name: "Escritório Teste A", role: "owner" })
  })

  it("joins the office with the invited role when the invitation is accepted", async () => {
    const email = uniqueEmail("contador")
    expect((await invite(owner, officeA, email, "accountant")).statusCode).toBe(200)
    const invitationId = invitationIdFor(email)
    const accountant = await user(email)

    const res = await accept(accountant, invitationId)
    expect(res.statusCode).toBe(200)
    expect(await memberRole(officeA, email)).toBe("accountant")
    expect((await officeOf(accountant)).json()).toMatchObject({ id: officeA, role: "accountant" })

    // Single use.
    expect((await accept(accountant, invitationId)).statusCode).toBe(400)
  })

  it("rejects an expired invitation", async () => {
    const email = uniqueEmail("atrasado")
    await invite(owner, officeA, email, "accountant")
    const invitationId = invitationIdFor(email)
    await db.admin.query(
      "update auth_invitations set expires_at = now() - interval '1 hour' where id = $1",
      [invitationId],
    )
    const res = await accept(await user(email), invitationId)
    expect(res.statusCode).toBe(400)
    expect(await memberRole(officeA, email)).toBeUndefined()
  })

  it("rejects an invitation accepted by another e-mail", async () => {
    const email = uniqueEmail("destinatario")
    await invite(owner, officeA, email, "accountant")
    const res = await accept(await user(uniqueEmail("intruso")), invitationIdFor(email))
    expect(res.statusCode).toBe(403)
  })

  it("only offers the owner and accountant roles", async () => {
    for (const role of ["admin", "member"]) {
      expect((await invite(owner, officeA, uniqueEmail("papel"), role)).statusCode).toBe(400)
    }
  })

  it("lets only the owner invite", async () => {
    const email = uniqueEmail("contadora")
    await invite(owner, officeA, email, "accountant")
    const accountant = await user(email)
    await accept(accountant, invitationIdFor(email))

    const res = await invite(accountant, officeA, uniqueEmail("outro"), "accountant")
    expect(res.statusCode).toBe(403)
  })
})

describe("tenant bridge", () => {
  const ownerAEmail = uniqueEmail("dona-a")
  let ownerA: string
  let officeA: string
  let officeB: string
  let clientA: string

  beforeAll(async () => {
    ownerA = await user(ownerAEmail)
    officeA = await createOffice(ownerA, "Escritório Ponte A")
    officeB = await createOffice(await user(uniqueEmail("dona-b")), "Escritório Ponte B")
    clientA = await createClient(db.app, officeA, {
      cnpj: "TEST0000000011",
      legalName: "Empresa Fictícia A",
    })
    await createClient(db.app, officeB, { cnpj: "TEST0000000012", legalName: "Empresa Fictícia B" })
  })

  it("answers 401 without a session", async () => {
    const res = await call("GET", "/test/clients")
    expect(res.statusCode).toBe(401)
    expect(problemSchema.parse(res.json()).status).toBe(401)
  })

  it("reads only the active office's data", async () => {
    const res = await call("GET", "/test/clients", { cookie: ownerA })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([{ id: clientA }])
  })

  it("does not let a member of office A switch to office B", async () => {
    const res = await call("POST", "/api/auth/organization/set-active", {
      cookie: ownerA,
      body: { organizationId: officeB },
    })
    expect(res.statusCode).toBe(403)
  })

  it("answers 403 when the session points at an office the user does not belong to", async () => {
    const setActive = (officeId: string) =>
      db.admin.query(
        `update auth_sessions set active_organization_id = $1
          where user_id = (select id from auth_users where email = $2)`,
        [officeId, ownerAEmail],
      )
    await setActive(officeB)
    try {
      expect((await call("GET", "/test/clients", { cookie: ownerA })).statusCode).toBe(403)
      expect((await officeOf(ownerA)).statusCode).toBe(403)
    } finally {
      await setActive(officeA)
    }
  })

  it("answers 403 for a user with no office", async () => {
    const res = await officeOf(await user(uniqueEmail("sem-escritorio")))
    expect(res.statusCode).toBe(403)
  })
})

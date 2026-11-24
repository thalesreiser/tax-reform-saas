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
import { auditPageSchema } from "../../src/routes/audit.js"
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
    // user() already spent two attempts on this e-mail: its sign-up and sign-in.
    for (let i = 2; i < CREDENTIAL_LIMITS.perEmail; i++) {
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

describe("password reset", () => {
  const NEW_PASSWORD = "nova-senha-de-teste-456"
  const tokenFor = (email: string) =>
    decodeURIComponent(linkIn(email, /\/redefinir-senha\?token=\S+/).split("token=")[1] ?? "")

  async function requestReset(email: string, ip?: string) {
    return call("POST", "/api/auth/request-password-reset", {
      body: { email, redirectTo: `${BASE_URL}/redefinir-senha` },
      ...(ip ? { ip } : {}),
    })
  }

  async function reset(token: string, newPassword = NEW_PASSWORD, ip?: string) {
    return call("POST", "/api/auth/reset-password", {
      body: { token, newPassword },
      ...(ip ? { ip } : {}),
    })
  }

  it("e-mails a web link, changes the password and signs out other sessions", async () => {
    const email = uniqueEmail("esqueceu")
    const oldSession = await user(email)
    expect((await requestReset(email)).statusCode).toBe(200)
    const mail = mailer.last(email)
    expect(mail?.subject).toBe("Redefinição de senha")
    expect(mail?.text).toContain(`${BASE_URL}/redefinir-senha?token=`)

    expect((await reset(tokenFor(email))).statusCode).toBe(200)
    expect((await signIn(email)).statusCode).toBe(401)
    expect((await signIn(email, NEW_PASSWORD)).statusCode).toBe(200)
    expect((await officeOf(oldSession)).statusCode).toBe(401)
  })

  it("rejects a reused token", async () => {
    const email = uniqueEmail("reuso")
    await user(email)
    await requestReset(email)
    const token = tokenFor(email)
    expect((await reset(token)).statusCode).toBe(200)
    const again = await reset(token, "outra-senha-de-teste-789")
    expect(again.statusCode).toBe(400)
    expect(problemSchema.parse(again.json()).code).toBe("INVALID_TOKEN")
  })

  it("rejects an expired token", async () => {
    const email = uniqueEmail("expirado")
    await user(email)
    await requestReset(email)
    await db.admin.query(
      `update auth_verifications set expires_at = now() - interval '1 minute'
        where identifier like 'reset-password:%'
          and value = (select id::text from auth_users where email = $1)`,
      [email],
    )
    const res = await reset(tokenFor(email))
    expect(res.statusCode).toBe(400)
    expect(problemSchema.parse(res.json()).code).toBe("INVALID_TOKEN")
    expect((await signIn(email)).statusCode).toBe(200)
  })

  it("answers the same for an unknown e-mail and sends nothing", async () => {
    const known = uniqueEmail("conhecido")
    await user(known)
    const unknown = uniqueEmail("desconhecido")
    const a = await requestReset(known)
    const b = await requestReset(unknown)
    expect(b.statusCode).toBe(a.statusCode)
    expect(b.body).toBe(a.body)
    expect(mailer.last(unknown)).toBeUndefined()
  })

  it("answers 429 after too many requests for one e-mail", async () => {
    const email = uniqueEmail("insistente")
    for (let i = 0; i < CREDENTIAL_LIMITS.perEmail; i++) {
      expect((await requestReset(email)).statusCode).toBe(200)
    }
    const limited = await requestReset(email)
    expect(limited.statusCode).toBe(429)
    expect(limited.headers["retry-after"]).toBeDefined()
  })

  it("answers 429 after too many reset submissions from one IP", async () => {
    const ip = nextIp()
    for (let i = 0; i < CREDENTIAL_LIMITS.perIp; i++) {
      expect((await reset(`token-falso-${i}`, NEW_PASSWORD, ip)).statusCode).toBe(400)
    }
    expect((await reset("token-falso", NEW_PASSWORD, ip)).statusCode).toBe(429)
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
    const invitationId = invitationIdFor(email)
    const accountant = await user(email)
    expect((await accept(accountant, invitationId)).statusCode).toBe(200)

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

describe("audit log of auth actions (RF-18)", () => {
  const ownerEmail = uniqueEmail("dona-auditoria")
  const accountantEmail = uniqueEmail("contador-auditoria")
  let owner: string
  let accountant: string
  let officeId: string
  let ownerId: string
  let accountantId: string
  let memberId: string
  let inviteRequestId: string
  let acceptRequestId: string

  const userId = async (email: string) =>
    (await db.admin.query<{ id: string }>("select id from auth_users where email = $1", [email]))
      .rows[0]?.id ?? ""

  async function audit(cookie: string, query = "") {
    return call("GET", `/office/audit${query}`, { cookie })
  }

  async function events(query = "") {
    const res = await audit(owner, query)
    expect(res.statusCode).toBe(200)
    return auditPageSchema.parse(res.json())
  }

  beforeAll(async () => {
    owner = await user(ownerEmail)
    officeId = await createOffice(owner, "Escritório Auditoria")
    const invited = await invite(owner, officeId, accountantEmail, "accountant")
    expect(invited.statusCode).toBe(200)
    inviteRequestId = String(invited.headers["x-request-id"])
    const invitationId = invitationIdFor(accountantEmail)
    accountant = await user(accountantEmail)
    const accepted = await accept(accountant, invitationId)
    expect(accepted.statusCode).toBe(200)
    acceptRequestId = String(accepted.headers["x-request-id"])
    memberId = accepted.json<{ member: { id: string } }>().member.id
    ownerId = await userId(ownerEmail)
    accountantId = await userId(accountantEmail)
  })

  it("records the office, the invitation and the join with actor and request id", async () => {
    const { items } = await events()
    expect(items.map((e) => e.action)).toEqual([
      "member.joined",
      "member.invited",
      "office.created",
    ])
    const [joined, invited, created] = items
    expect(created).toMatchObject({
      actor: { userId: ownerId, role: "owner" },
      resource: { type: "office", id: officeId },
    })
    expect(invited).toMatchObject({
      actor: { userId: ownerId, role: "owner" },
      resource: { type: "invitation" },
      requestId: inviteRequestId,
      metadata: { role: "accountant" },
    })
    expect(joined).toMatchObject({
      actor: { userId: accountantId, role: "accountant" },
      resource: { type: "member", id: memberId },
      requestId: acceptRequestId,
      metadata: { role: "accountant", invitationId: invited?.resource.id },
    })
  })

  it("records who canceled an invitation and when", async () => {
    const email = uniqueEmail("cancelado")
    await invite(owner, officeId, email, "accountant")
    const invitationId = invitationIdFor(email)
    const before = Date.now()
    const res = await call("POST", "/api/auth/organization/cancel-invitation", {
      cookie: owner,
      body: { invitationId },
    })
    expect(res.statusCode).toBe(200)
    const { items } = await events("?action=member.invitation_canceled")
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      actor: { userId: ownerId, role: "owner" },
      resource: { type: "invitation", id: invitationId },
      requestId: res.headers["x-request-id"],
    })
    expect(Date.parse(items[0]?.occurredAt ?? "")).toBeGreaterThanOrEqual(before - 1000)
  })

  it("records a rename, a role change and a removal by the owner", async () => {
    const renamed = await call("POST", "/api/auth/organization/update", {
      cookie: owner,
      body: { organizationId: officeId, data: { name: "Escritório Auditoria Novo" } },
    })
    expect(renamed.statusCode).toBe(200)
    const roleChanged = await call("POST", "/api/auth/organization/update-member-role", {
      cookie: owner,
      body: { organizationId: officeId, memberId, role: "owner" },
    })
    expect(roleChanged.statusCode).toBe(200)
    const removed = await call("POST", "/api/auth/organization/remove-member", {
      cookie: owner,
      body: { organizationId: officeId, memberIdOrEmail: memberId },
    })
    expect(removed.statusCode).toBe(200)

    const { items } = await events()
    const byOwner = { actor: { userId: ownerId, role: "owner" } }
    expect(items.slice(0, 3)).toEqual([
      expect.objectContaining({
        ...byOwner,
        action: "member.removed",
        metadata: { role: "owner" },
        requestId: removed.headers["x-request-id"],
      }),
      expect.objectContaining({
        ...byOwner,
        action: "member.role_changed",
        resource: { type: "member", id: memberId },
        metadata: { from: "accountant", to: "owner" },
      }),
      expect.objectContaining({
        ...byOwner,
        action: "office.updated",
        metadata: { fields: ["name"] },
      }),
    ])
  })

  it("never stores names or e-mails", async () => {
    const stored = await db.admin.query("select * from audit_events where office_id = $1", [
      officeId,
    ])
    const text = JSON.stringify(stored.rows)
    for (const secret of [ownerEmail, accountantEmail, "Escritório", "Pessoa Teste"]) {
      expect(text).not.toContain(secret)
    }
  })

  it("pages with a cursor and filters by date", async () => {
    const all = await events()
    const first = await events("?limit=2")
    expect(first.items).toEqual(all.items.slice(0, 2))
    expect(first.nextCursor).not.toBeNull()
    const second = await events(`?limit=2&cursor=${first.nextCursor ?? ""}`)
    expect(second.items).toEqual(all.items.slice(2, 4))
    const future = await events(`?from=${new Date(Date.now() + 60_000).toISOString()}`)
    expect(future).toEqual({ items: [], nextCursor: null })
    expect((await audit(owner, "?cursor=nope")).statusCode).toBe(400)
  })

  it("is owner-only", async () => {
    const email = uniqueEmail("contadora-auditoria")
    await invite(owner, officeId, email, "accountant")
    const invitationId = invitationIdFor(email)
    const other = await user(email)
    expect((await accept(other, invitationId)).statusCode).toBe(200)
    const res = await audit(other)
    expect(res.statusCode).toBe(403)
    expect(problemSchema.parse(res.json()).status).toBe(403)
    expect((await audit("")).statusCode).toBe(401)
  })

  it("records a member who leaves", async () => {
    const email = uniqueEmail("saindo")
    await invite(owner, officeId, email, "accountant")
    const invitationId = invitationIdFor(email)
    const leaver = await user(email)
    expect((await accept(leaver, invitationId)).statusCode).toBe(200)
    const res = await call("POST", "/api/auth/organization/leave", {
      cookie: leaver,
      body: { organizationId: officeId },
    })
    expect(res.statusCode).toBe(200)
    const { items } = await events("?action=member.left")
    expect(items[0]).toMatchObject({
      actor: { userId: await userId(email), role: "accountant" },
      metadata: { role: "accountant" },
      requestId: res.headers["x-request-id"],
    })
  })
})

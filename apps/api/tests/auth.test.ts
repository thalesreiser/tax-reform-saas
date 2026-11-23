import type { FastifyBaseLogger } from "fastify"
import { afterEach, describe, expect, it, vi } from "vitest"
import { type App, buildApp } from "../src/app.js"
import { CREDENTIAL_LIMITS } from "../src/auth/plugin.js"
import { LogMailer, invitationMail, verificationMail } from "../src/auth/mailer.js"
import { isOfficeRole } from "../src/auth/roles.js"
import { loadConfig } from "../src/config.js"
import { problemSchema } from "../src/problem.js"
import { TEST_ENV } from "./env.js"

// No database here (TEST_ENV points nowhere): every case must answer before a query.
let app: App | undefined

async function start(): Promise<App> {
  app = await buildApp(loadConfig(TEST_ENV))
  await app.ready()
  return app
}

afterEach(async () => {
  await app?.close()
  app = undefined
})

describe("office roles", () => {
  it("are owner and accountant only", () => {
    expect(isOfficeRole("owner")).toBe(true)
    expect(isOfficeRole("accountant")).toBe(true)
    for (const role of ["admin", "member", "Owner", "", undefined]) {
      expect(isOfficeRole(role)).toBe(false)
    }
  })
})

describe("mail", () => {
  const message = invitationMail({
    to: "convidado@example.test",
    officeName: "Escritório Teste",
    role: "accountant",
    url: "https://app.example.test/convites/secret-id",
  })

  it("writes invitations in Portuguese with the link", () => {
    expect(message.subject).toBe("Convite para o escritório Escritório Teste")
    expect(message.text).toContain("como contador")
    expect(message.text).toContain("https://app.example.test/convites/secret-id")
    expect(verificationMail({ to: "a@example.test", url: "https://x.test/v" }).text).toContain(
      "https://x.test/v",
    )
  })

  function fakeLog() {
    const info = vi.fn()
    const warn = vi.fn()
    return { log: { info, warn } as unknown as FastifyBaseLogger, info, warn }
  }

  it("logs the whole message outside production", async () => {
    const { log, info } = fakeLog()
    await new LogMailer(log, false).send(message)
    expect(JSON.stringify(info.mock.calls)).toContain("secret-id")
  })

  it("never logs the link or the address in production", async () => {
    const { log, info, warn } = fakeLog()
    await new LogMailer(log, true).send(message)
    expect(info).not.toHaveBeenCalled()
    const logged = JSON.stringify(warn.mock.calls)
    expect(logged).not.toContain("secret-id")
    expect(logged).not.toContain("convidado@example.test")
  })
})

describe("auth routes", () => {
  it("answers 401 problem details on /office without a session", async () => {
    const res = await (await start()).inject({ method: "GET", url: "/office" })
    expect(res.statusCode).toBe(401)
    expect(problemSchema.parse(res.json())).toMatchObject({ status: 401 })
  })

  it("rejects malformed ids before better-auth reaches the database", async () => {
    const res = await (
      await start()
    ).inject({
      method: "POST",
      url: "/api/auth/organization/accept-invitation",
      payload: { invitationId: "not-a-uuid" },
    })
    expect(res.statusCode).toBe(400)
    expect(problemSchema.parse(res.json()).detail).toBe("Invalid invitationId.")
  })

  it("limits sign-in attempts per e-mail with 429 problem details", async () => {
    const api = await start()
    // An invalid e-mail is rejected by better-auth before any query, and still counts.
    const attempt = () =>
      api.inject({
        method: "POST",
        url: "/api/auth/sign-in/email",
        payload: { email: "Not-An-Email", password: "whatever-password" },
      })
    for (let i = 0; i < CREDENTIAL_LIMITS.perEmail; i++) {
      expect((await attempt()).statusCode).toBe(400)
    }
    const limited = await attempt()
    expect(limited.statusCode).toBe(429)
    expect(limited.headers["retry-after"]).toBeDefined()
    expect(problemSchema.parse(limited.json())).toMatchObject({ status: 429 })
  })

  it("keeps the auth routes out of the OpenAPI document", async () => {
    const res = await (await start()).inject({ method: "GET", url: "/openapi.json" })
    const paths = Object.keys(res.json<{ paths: Record<string, unknown> }>().paths)
    expect(paths).toContain("/office")
    expect(paths.some((p) => p.startsWith("/api/auth"))).toBe(false)
  })
})

import type { FastifyBaseLogger } from "fastify"
import { afterEach, describe, expect, it, vi } from "vitest"
import { type App, buildApp } from "../src/app.js"
import { CREDENTIAL_LIMITS } from "../src/auth/plugin.js"
import {
  LogMailer,
  invitationMail,
  resetPasswordMail,
  verificationMail,
} from "../src/auth/mailer.js"
import { isOfficeRole } from "../src/auth/roles.js"
import { loadConfig } from "../src/config.js"
import { problemSchema } from "../src/problem.js"
import { TEST_ENV } from "./env.js"

// No database here (TEST_ENV points nowhere): every case must answer before a query.
let app: App | undefined

const WEB_URL = "https://web.example.test"

async function start(env: Record<string, string> = {}): Promise<App> {
  app = await buildApp(loadConfig({ ...TEST_ENV, ...env }))
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

  it("writes the password reset e-mail in Portuguese with the link", () => {
    const reset = resetPasswordMail({ to: "a@example.test", url: "https://x.test/r?token=t" })
    expect(reset.subject).toBe("Redefinição de senha")
    expect(reset.text).toContain("https://x.test/r?token=t")
    expect(reset.text).toContain("1 hora")
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

  it("answers the preflight of WEB_URL with credentials and exposed headers", async () => {
    const res = await (
      await start({ WEB_URL })
    ).inject({
      method: "OPTIONS",
      url: "/api/auth/sign-in/email",
      headers: {
        origin: WEB_URL,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    })
    expect(res.statusCode).toBe(204)
    expect(res.headers["access-control-allow-origin"]).toBe(WEB_URL)
    expect(res.headers["access-control-allow-credentials"]).toBe("true")
    expect(res.headers["access-control-max-age"]).toBe("600")
  })

  it("exposes retry-after and the request id to WEB_URL", async () => {
    const res = await (
      await start({ WEB_URL })
    ).inject({ method: "GET", url: "/office", headers: { origin: WEB_URL } })
    expect(res.headers["access-control-allow-origin"]).toBe(WEB_URL)
    expect(res.headers["access-control-expose-headers"]).toBe("retry-after, x-request-id")
  })

  it.each(["https://evil.example.test", "https://web.example.test.evil.test"])(
    "sends no CORS headers to %s",
    async (origin) => {
      const api = await start({ WEB_URL })
      const preflight = await api.inject({
        method: "OPTIONS",
        url: "/api/auth/sign-in/email",
        headers: { origin, "access-control-request-method": "POST" },
      })
      const get = await api.inject({ method: "GET", url: "/office", headers: { origin } })
      for (const res of [preflight, get]) {
        expect(res.headers["access-control-allow-origin"]).toBeUndefined()
        expect(res.headers["access-control-allow-credentials"]).toBeUndefined()
      }
    },
  )

  it("allows preview hosts matching CORS_EXTRA_ORIGINS", async () => {
    const origin = "https://abc123-trs-web.acct.workers.test"
    const res = await (
      await start({ WEB_URL, CORS_EXTRA_ORIGINS: "https://*-trs-web.acct.workers.test" })
    ).inject({ method: "GET", url: "/office", headers: { origin } })
    expect(res.headers["access-control-allow-origin"]).toBe(origin)
  })

  it("keeps the auth routes out of the OpenAPI document", async () => {
    const res = await (await start()).inject({ method: "GET", url: "/openapi.json" })
    const paths = Object.keys(res.json<{ paths: Record<string, unknown> }>().paths)
    expect(paths).toContain("/office")
    expect(paths.some((p) => p.startsWith("/api/auth"))).toBe(false)
  })
})

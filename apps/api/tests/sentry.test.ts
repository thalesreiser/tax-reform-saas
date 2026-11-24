import type { ErrorEvent } from "@sentry/node"
import { describe, expect, it } from "vitest"
import { serializeRequest } from "../src/app.js"
import { loadConfig } from "../src/config.js"
import { hashOfficeId, initSentry, scrubEvent, scrubText } from "../src/sentry.js"
import { TEST_ENV } from "./env.js"

// Fictional identifiers only.
const CNPJ = "12.345.678/0001-95"

function event(): ErrorEvent {
  return {
    type: undefined,
    message: `Falha ao salvar ${CNPJ} de contato@escritorio.example`,
    request: {
      method: "POST",
      url: "https://api.example/v1/clients?cnpj=12345678000195",
      query_string: "cnpj=12345678000195",
      cookies: { session: "secret" },
      headers: { authorization: "Bearer x", cookie: "a=b", "x-api-key": "k" },
      data: { razaoSocial: "Padaria Ficticia Ltda", cnpj: CNPJ },
    },
    user: { id: "u1", email: "pessoa@example.com", ip_address: "10.0.0.1" },
    extra: { body: { faturamento: "100000.00" } },
    breadcrumbs: [{ message: "GET /v1/clients?nome=Padaria" }],
    server_name: "host-1",
    contexts: { trace: { trace_id: "t", span_id: "s" }, office: { name: "Escritorio X" } },
    exception: {
      values: [
        {
          type: "Error",
          value: `CPF 123.456.789-09 / ${CNPJ}`,
          stacktrace: { frames: [{ function: "save", vars: { cnpj: CNPJ } }] },
        },
      ],
    },
  }
}

describe("scrubEvent", () => {
  const scrubbed = JSON.stringify(scrubEvent(event()))

  it("keeps only the request method", () => {
    expect(scrubEvent(event()).request).toEqual({ method: "POST" })
  })

  it.each([
    ["authorization header", "Bearer x"],
    ["cookie", "secret"],
    ["api key", '"k"'],
    ["query string", "12345678000195"],
    ["body / company name", "Padaria"],
    ["formatted CNPJ", CNPJ],
    ["CPF", "123.456.789-09"],
    ["e-mail", "@example"],
    ["user ip", "10.0.0.1"],
    ["revenue in extra data", "100000.00"],
    ["office name in contexts", "Escritorio X"],
    ["server name", "host-1"],
  ])("removes the %s", (_label, value) => {
    expect(scrubbed).not.toContain(value)
  })

  it("keeps the trace context and the error type", () => {
    const result = scrubEvent(event())
    expect(result.contexts?.trace?.trace_id).toBe("t")
    expect(result.exception?.values?.[0]?.type).toBe("Error")
    expect(result.exception?.values?.[0]?.value).toBe("CPF [redacted] / [redacted]")
  })
})

describe("helpers", () => {
  it("masks CNPJ digits without punctuation", () => {
    expect(scrubText("cnpj 12345678000195 ok")).toBe("cnpj [redacted] ok")
  })

  it("hashes the office id one way, stable and short", () => {
    const hash = hashOfficeId("office-1")
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
    expect(hash).toBe(hashOfficeId("office-1"))
    expect(hash).not.toContain("office")
  })

  it("logs the route pattern, never the URL or query string", () => {
    expect(serializeRequest({ method: "GET", routeOptions: { url: "/v1/clients/:id" } })).toEqual({
      method: "GET",
      route: "/v1/clients/:id",
    })
  })
})

describe("initSentry", () => {
  it("does nothing without SENTRY_DSN", () => {
    expect(initSentry(loadConfig(TEST_ENV))).toBe(false)
  })

  it("rejects a DSN that is not https and defaults tracing to 0", () => {
    expect(() => loadConfig({ ...TEST_ENV, SENTRY_DSN: "http://k@o0.ingest.sentry.io/1" })).toThrow(
      /SENTRY_DSN/,
    )
    expect(loadConfig(TEST_ENV).SENTRY_TRACES_SAMPLE_RATE).toBe(0)
  })
})

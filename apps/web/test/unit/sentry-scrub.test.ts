import { describe, expect, it } from "vitest"
import { scrubSentryEvent, scrubSentryText } from "../../shared/utils/sentry-scrub"

// Fictional identifiers only.
const CNPJ = "12.345.678/0001-95"

describe("scrubSentryEvent", () => {
  const event = () => ({
    message: `Erro com ${CNPJ}`,
    request: {
      method: "GET",
      url: "https://app.example/clientes/123?cnpj=12345678000195#aba",
      headers: { cookie: "session=secret", "user-agent": "x" },
      data: "razaoSocial=Padaria+Ficticia",
    },
    user: { email: "pessoa@example.com", ip_address: "10.0.0.1" },
    extra: { formValues: { faturamento: "100000.00" } },
    breadcrumbs: [{ category: "ui.input", message: "input#cnpj" }],
    exception: {
      values: [
        { value: "contato@escritorio.example", stacktrace: { frames: [{ vars: { a: 1 } }] } },
      ],
    },
  })

  it("keeps the method and path only", () => {
    expect(scrubSentryEvent(event()).request).toEqual({
      method: "GET",
      url: "https://app.example/clientes/123",
    })
  })

  it("drops cookies, headers, bodies, form values, user, extra and breadcrumbs", () => {
    const json = JSON.stringify(scrubSentryEvent(event()))
    for (const value of [
      "secret",
      "Padaria",
      "100000.00",
      "10.0.0.1",
      "input#cnpj",
      "12345678000195",
      "@example",
      CNPJ,
    ]) {
      expect(json).not.toContain(value)
    }
  })

  it("masks fiscal ids and e-mails in text", () => {
    expect(scrubSentryText(`CPF 123.456.789-09, ${CNPJ}`)).toBe("CPF [redacted], [redacted]")
  })
})

import { describe, expect, it } from "vitest"
import {
  type ClientAction,
  clientErrorKey,
  clientFormSchema,
  formatFetchedAt,
  lookupFailed,
  regimeKey,
} from "../../app/utils/clients"

const failure = (status: number) => ({ response: { status } })
const t = (key: string) => key

describe("client error messages", () => {
  it.each<[number | undefined, ClientAction, string]>([
    [undefined, "lookup", "clients.errors.network"],
    [404, "lookup", "clients.errors.cnpjNotFound"],
    [422, "create", "clients.errors.cnpjNotFound"],
    [429, "lookup", "clients.errors.rateLimited"],
    [429, "create", "clients.errors.rateLimited"],
    [502, "lookup", "clients.errors.lookupUnavailable"],
    [504, "create", "clients.errors.lookupUnavailable"],
    [409, "create", "clients.errors.duplicate"],
    [404, "load", "clients.errors.notFound"],
    [400, "load", "clients.errors.notFound"],
    [404, "delete", "clients.errors.notFound"],
    [500, "save", "clients.errors.generic"],
    [502, "save", "clients.errors.generic"],
  ])("HTTP %s on %s -> %s", (status, action, key) => {
    const error = status === undefined ? new TypeError("fetch failed") : failure(status)
    expect(clientErrorKey(error, action)).toBe(key)
  })

  it("switches to manual entry only when the registry cannot answer", () => {
    for (const s of [404, 422, 502, 504]) expect(lookupFailed(failure(s))).toBe(true)
    for (const s of [409, 429, 500]) expect(lookupFailed(failure(s))).toBe(false)
  })
})

describe("client view helpers", () => {
  it("names only the regimes the registry states", () => {
    expect(regimeKey("mei")).toBe("clients.regimes.mei")
    expect(regimeKey("simples_nacional")).toBe("clients.regimes.simples_nacional")
    expect(regimeKey("unknown")).toBe("clients.regimes.unknown")
    expect(regimeKey(null)).toBe("clients.regimes.unknown")
  })

  it("shows the lookup time in Brasília", () => {
    expect(formatFetchedAt("2026-11-24T17:05:00.000Z")).toBe("24/11/2026, 14:05")
  })

  it("validates the form: valid CNPJ and a legal name", () => {
    const schema = clientFormSchema(t, true)
    const base = { cnpj: "12.abc.345/01de-35", legalName: " Empresa ", tradeName: "", notes: "" }
    expect(schema.parse(base).legalName).toBe("Empresa")
    expect(schema.safeParse({ ...base, cnpj: "11.222.333/0001-82" }).success).toBe(false)
    expect(schema.safeParse({ ...base, legalName: "  " }).success).toBe(false)
    expect(clientFormSchema(t, false).safeParse({ ...base, cnpj: "" }).success).toBe(true)
  })
})

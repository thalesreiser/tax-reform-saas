import { readFileSync } from "node:fs"
import fastifyRateLimit from "@fastify/rate-limit"
import Fastify, { type FastifyRequest } from "fastify"
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cnpjCheckDigits, cnpjSchema, isValidCnpj, normalizeCnpj } from "../src/clients/cnpj.js"
import {
  CnpjLookup,
  CnpjLookupError,
  type CnpjProvider,
  brasilApiProvider,
  fromBrasilApi,
} from "../src/clients/lookup.js"
import { createDb } from "../src/db/client.js"
import { errorHandler, problemSchema } from "../src/problem.js"
import { LOOKUP_LIMIT, clientRoutes } from "../src/routes/clients.js"
import { TEST_ENV } from "./env.js"

// Fictional, generated CNPJs only. 12ABC34501DE35 is the Receita Federal's own worked example.
const FIXTURE: unknown = JSON.parse(
  readFileSync(new URL("fixtures/brasilapi-cnpj.json", import.meta.url), "utf8"),
)
const NUMERIC = "11222333000181"
const ALPHA = "12ABC34501DE35"

describe("CNPJ validation", () => {
  it.each([NUMERIC, ALPHA, "ABCDEFGH000195", "TESTE000000161"])("accepts %s", (cnpj) => {
    expect(isValidCnpj(cnpj)).toBe(true)
  })

  it("computes the official example's check digits (ASCII - 48)", () => {
    expect(cnpjCheckDigits("12ABC34501DE")).toBe("35")
    expect(cnpjCheckDigits("112223330001")).toBe("81")
  })

  it.each([
    ["wrong first digit", "11222333000191"],
    ["wrong second digit", "11222333000182"],
    ["wrong alphanumeric digits", "12ABC34501DE36"],
    ["letter in a check digit", "12ABC34501DE3A"],
    ["lowercase (not normalised)", "12abc34501de35"],
    ["too short", "1122233300018"],
    ["too long", "112223330001811"],
    ["repeated digits", "00000000000000"],
    ["repeated digits, other", "11111111111111"],
    ["symbol", "11222333#00181"],
    ["empty", ""],
  ])("rejects %s", (_label, cnpj) => {
    expect(isValidCnpj(cnpj)).toBe(false)
  })

  it("normalises the mask and the case", () => {
    expect(normalizeCnpj("11.222.333/0001-81")).toBe(NUMERIC)
    expect(normalizeCnpj(" 12.abc.345/01de-35 ")).toBe(ALPHA)
    expect(cnpjSchema.parse("12.abc.345/01de-35")).toBe(ALPHA)
    expect(cnpjSchema.safeParse("11.222.333/0001-82").success).toBe(false)
  })

  it("rejects a base that is not 12 characters", () => {
    expect(() => cnpjCheckDigits("1234")).toThrow(RangeError)
  })
})

describe("BrasilAPI mapping", () => {
  const at = new Date("2026-11-24T12:00:00.000Z")

  it("maps the registry fields to our shape", () => {
    expect(fromBrasilApi(FIXTURE, at)).toEqual({
      cnpj: NUMERIC,
      legalName: "EMPRESA FICTICIA DE TESTES LTDA",
      tradeName: "LOJA EXEMPLO",
      address: {
        street: "RUA DOS TESTES",
        number: "100",
        complement: null,
        district: "CENTRO",
        city: "CIDADE EXEMPLO",
        state: "SP",
        postalCode: "01000000",
        ibgeCode: "3550308",
      },
      mainCnae: {
        code: "4781400",
        description: "Comércio varejista de artigos do vestuário e acessórios",
      },
      secondaryCnaes: [{ code: "4782201", description: "Comércio varejista de calçados" }],
      registrationStatus: "ATIVA",
      simplesOption: true,
      meiOption: false,
      taxRegime: "simples_nacional",
      latestDeclaredTaxation: { year: 2021, form: "LUCRO PRESUMIDO" },
      source: "brasilapi",
      fetchedAt: "2026-11-24T12:00:00.000Z",
    })
  })

  it("says mei when the MEI option is set", () => {
    const body = { ...(FIXTURE as object), opcao_pelo_mei: true }
    expect(fromBrasilApi(body, at).taxRegime).toBe("mei")
  })

  it("does not infer the regime when the source does not state Simples or MEI", () => {
    const body = {
      ...(FIXTURE as object),
      opcao_pelo_simples: null,
      opcao_pelo_mei: undefined,
      regime_tributario: undefined,
    }
    const record = fromBrasilApi(body, at)
    expect(record.taxRegime).toBe("unknown")
    expect(record.simplesOption).toBeNull()
    expect(record.latestDeclaredTaxation).toBeNull()
    expect(fromBrasilApi({ ...(FIXTURE as object), opcao_pelo_simples: false }, at).taxRegime).toBe(
      "unknown",
    )
  })
})

const response = (status: number, body: unknown = {}) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }))

describe("BrasilAPI provider", () => {
  const provider = (fetch: typeof globalThis.fetch) =>
    brasilApiProvider({ baseUrl: "https://registry.example.test/cnpj/", timeoutMs: 50, fetch })

  it("calls the CNPJ URL and maps the answer", async () => {
    const fetch = vi.fn(() => response(200, FIXTURE))
    const record = await provider(fetch).fetch(NUMERIC)
    expect(record.legalName).toBe("EMPRESA FICTICIA DE TESTES LTDA")
    expect(fetch).toHaveBeenCalledWith(
      `https://registry.example.test/cnpj/${NUMERIC}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) as unknown }),
    )
  })

  it.each([
    [404, "not_found"],
    [400, "upstream"],
    [429, "upstream"],
    [500, "upstream"],
  ])("maps HTTP %i to %s", async (status, kind) => {
    await expect(provider(() => response(status)).fetch(NUMERIC)).rejects.toMatchObject({ kind })
  })

  it("maps an unexpected body to upstream", async () => {
    await expect(provider(() => response(200, { foo: 1 })).fetch(NUMERIC)).rejects.toMatchObject({
      kind: "upstream",
    })
  })

  it("maps a timeout and a network error", async () => {
    const timeout = () => Promise.reject(new DOMException("timed out", "TimeoutError"))
    await expect(provider(timeout).fetch(NUMERIC)).rejects.toMatchObject({ kind: "timeout" })
    const network = () => Promise.reject(new TypeError("fetch failed"))
    await expect(provider(network).fetch(NUMERIC)).rejects.toMatchObject({ kind: "upstream" })
  })
})

function fakeProvider(result: () => Promise<unknown>): CnpjProvider & { calls: number } {
  const p = {
    name: "fake",
    calls: 0,
    async fetch() {
      p.calls += 1
      return fromBrasilApi(await result(), new Date())
    },
  }
  return p
}

describe("CnpjLookup cache", () => {
  it("answers a repeated CNPJ from the cache and does not cache failures", async () => {
    let fail = true
    const provider = fakeProvider(() =>
      fail ? Promise.reject(new CnpjLookupError("upstream")) : Promise.resolve(FIXTURE),
    )
    const lookup = new CnpjLookup(provider)
    await expect(lookup.get(NUMERIC)).rejects.toBeInstanceOf(CnpjLookupError)
    fail = false
    await lookup.get(NUMERIC)
    await lookup.get(NUMERIC)
    expect(provider.calls).toBe(2)
  })
})

let closeApp: (() => Promise<unknown>) | undefined
afterEach(async () => {
  await closeApp?.()
  closeApp = undefined
})

async function start(provider: CnpjProvider) {
  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  await app.register(fastifyRateLimit, { global: false })
  app.decorateRequest("office", null)
  const authenticate = (request: FastifyRequest) => {
    const id = request.headers["x-office"]
    request.office = {
      id: typeof id === "string" ? id : "00000000-0000-4000-8000-000000000001",
      role: "accountant",
      userId: "00000000-0000-4000-8000-0000000000aa",
    }
    return Promise.resolve(undefined)
  }
  const db = createDb(TEST_ENV.DATABASE_URL)
  await app.register(clientRoutes, {
    db,
    lookup: new CnpjLookup(provider),
    authenticate: [authenticate],
  })
  await app.ready()
  closeApp = async () => {
    await app.close()
    await db.close()
  }
  return app
}

describe("GET /v1/cnpj/:cnpj", () => {
  it("answers the registry data for a masked CNPJ", async () => {
    const app = await start(fakeProvider(() => Promise.resolve(FIXTURE)))
    const res = await app.inject({ url: `/v1/cnpj/${encodeURIComponent("11.222.333/0001-81")}` })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ cnpj: NUMERIC, taxRegime: "simples_nacional" })
  })

  it("rejects an invalid CNPJ without calling the provider", async () => {
    const provider = fakeProvider(() => Promise.resolve(FIXTURE))
    const app = await start(provider)
    const res = await app.inject({ url: "/v1/cnpj/11222333000182" })
    expect(res.statusCode).toBe(400)
    expect(provider.calls).toBe(0)
  })

  it.each([
    ["not_found", 404],
    ["timeout", 504],
    ["upstream", 502],
  ] as const)("maps %s to %i with a generic problem", async (kind, status) => {
    const app = await start(fakeProvider(() => Promise.reject(new CnpjLookupError(kind, 500))))
    const res = await app.inject({ url: `/v1/cnpj/${ALPHA}` })
    expect(res.statusCode).toBe(status)
    const body = problemSchema.parse(res.json())
    expect(body.detail).not.toContain(ALPHA)
  })

  it("limits lookups per office", async () => {
    const app = await start(fakeProvider(() => Promise.resolve(FIXTURE)))
    const statuses: number[] = []
    for (let i = 0; i <= LOOKUP_LIMIT.max; i += 1) {
      statuses.push((await app.inject({ url: `/v1/cnpj/${NUMERIC}` })).statusCode)
    }
    expect(statuses.slice(0, LOOKUP_LIMIT.max).every((s) => s === 200)).toBe(true)
    const last = await app.inject({ url: `/v1/cnpj/${NUMERIC}` })
    expect(last.statusCode).toBe(429)
    expect(last.headers["retry-after"]).toBeDefined()
    const other = await app.inject({
      url: `/v1/cnpj/${NUMERIC}`,
      headers: { "x-office": "00000000-0000-4000-8000-000000000002" },
    })
    expect(other.statusCode).toBe(200)
  })

  it("validates client bodies before touching the database", async () => {
    const app = await start(fakeProvider(() => Promise.resolve(FIXTURE)))
    const bad = await app.inject({ method: "POST", url: "/v1/clients", payload: { cnpj: "123" } })
    expect(bad.statusCode).toBe(400)
    const noName = await app.inject({
      method: "POST",
      url: "/v1/clients",
      payload: { cnpj: NUMERIC },
    })
    expect(noName.statusCode).toBe(400)
    const empty = await app.inject({
      method: "PATCH",
      url: "/v1/clients/00000000-0000-4000-8000-000000000003",
      payload: {},
    })
    expect(empty.statusCode).toBe(400)
  })
})

import { dec } from "@trs/tax-legacy"
import Fastify from "fastify"
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod"
import { afterEach, describe, expect, it, vi } from "vitest"
import { buildApp } from "../src/app.js"
import { loadConfig } from "../src/config.js"
import { errorHandler, problemSchema } from "../src/problem.js"
import { type ReferenceEngine, referenceRoutes } from "../src/routes/reference.js"
import { TEST_ENV } from "./env.js"

const VERSION = { versaoApp: "1.2.3", versaoDb: "4.5.6", dataVersaoDb: "2026-10-01" }

function fakeEngine(overrides: Partial<ReferenceEngine> = {}) {
  const ok = <T>(value: T) => Promise.resolve({ ok: true as const, value })
  return {
    getVersion: vi.fn(() => ok(VERSION)),
    listSituacoesTributarias: vi.fn(() => ok([{ id: 1, codigo: "000", descricao: "Integral" }])),
    getClassificacaoTributaria: vi.fn(() => ok({ codigo: "000001" })),
    listFundamentacoesLegais: vi.fn(() => ok([])),
    listNcm: vi.fn(() =>
      ok([
        { ncm: "22030000", descricao: "Cervejas de malte" },
        { ncm: "01012100", descricao: "Cavalos reprodutores" },
        { ncm: "01012900", descricao: "Outros cavalos" },
      ]),
    ),
    getNcm: vi.fn(() => ok({ capitulo: "22" })),
    listNbs: vi.fn(() => ok([])),
    getNbs: vi.fn(() => ok({ item: "1" })),
    getAliquotaUniao: vi.fn(() =>
      ok({ aliquotaReferencia: dec("0.9"), aliquotaPropria: dec("0.90") }),
    ),
    getAliquotaUf: vi.fn(() => ok({ aliquotaReferencia: dec("0.1") })),
    getAliquotaMunicipio: vi.fn(() => ok({ aliquotaReferencia: dec("0.05") })),
    ...overrides,
  } satisfies ReferenceEngine
}

let closeApp: (() => Promise<unknown>) | undefined
afterEach(async () => {
  await closeApp?.()
  closeApp = undefined
})

async function start(engine?: ReferenceEngine, ttlSeconds = 60) {
  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  const authenticate = vi.fn(() => Promise.resolve(undefined))
  await app.register(referenceRoutes, {
    prefix: "/v1/reference",
    authenticate: [authenticate],
    timeoutMs: 1000,
    ttlSeconds,
    ...(engine === undefined ? {} : { engine }),
  })
  await app.ready()
  closeApp = () => app.close()
  return { app, authenticate }
}

describe("reference data routes", () => {
  it("answers with versions, decimals as text and cache headers", async () => {
    const { app, authenticate } = await start(fakeEngine())
    const res = await app.inject({ url: "/v1/reference/rates/union?date=2027-01-01" })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      engine: { name: "calculadora-rtc-regime-regular", version: "1.2.3" },
      dataVersion: { version: "4.5.6", date: "2026-10-01" },
      validOn: "2027-01-01",
      data: { aliquotaReferencia: "0.9", aliquotaPropria: "0.9" },
    })
    expect(res.headers["cache-control"]).toBe("private, max-age=60")
    expect(res.headers.etag).toMatch(/^".+"$/)
    expect(authenticate).toHaveBeenCalledOnce()
  })

  it("answers a repeated query from the cache", async () => {
    const engine = fakeEngine()
    const { app } = await start(engine)
    for (let i = 0; i < 3; i++) {
      expect((await app.inject({ url: "/v1/reference/cst?date=2027-01-01" })).statusCode).toBe(200)
    }
    await app.inject({ url: "/v1/reference/cst?date=2027-02-01" })
    expect(engine.listSituacoesTributarias).toHaveBeenCalledTimes(2)
    expect(engine.getVersion).toHaveBeenCalledOnce()
  })

  it("asks the engine again after the TTL", async () => {
    const engine = fakeEngine()
    const { app } = await start(engine, 1)
    await app.inject({ url: "/v1/reference/rates/states/33?date=2027-01-01" })
    await new Promise((resolve) => setTimeout(resolve, 1100))
    await app.inject({ url: "/v1/reference/rates/states/33?date=2027-01-01" })
    expect(engine.getAliquotaUf).toHaveBeenCalledTimes(2)
  })

  it("coalesces concurrent misses into one engine call", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    const engine = fakeEngine({
      getNcm: vi.fn(async () => {
        await gate
        return { ok: true as const, value: { capitulo: "22" } }
      }),
    })
    const { app } = await start(engine)
    const calls = [1, 2, 3].map(() =>
      app.inject({ url: "/v1/reference/ncm/22030000?date=2027-01-01" }),
    )
    await vi.waitFor(() => expect(engine.getNcm).toHaveBeenCalled())
    release()
    const results = await Promise.all(calls)
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200])
    expect(engine.getNcm).toHaveBeenCalledOnce()
  })

  it("answers 304 to a matching If-None-Match", async () => {
    const { app } = await start(fakeEngine())
    const url = "/v1/reference/class-trib/000001?date=2027-01-01"
    const first = await app.inject({ url })
    const again = await app.inject({
      url,
      headers: { "if-none-match": String(first.headers.etag) },
    })
    expect(again.statusCode).toBe(304)
    expect(again.body).toBe("")
  })

  it("searches and pages the NCM table", async () => {
    const { app } = await start(fakeEngine())
    const res = await app.inject({
      url: "/v1/reference/ncm?date=2027-01-01&q=CAVALOS&pageSize=1&page=2",
    })
    expect(res.json<{ data: unknown }>().data).toEqual({
      items: [{ codigo: "01012900", descricao: "Outros cavalos" }],
      page: 2,
      pageSize: 1,
      total: 2,
    })
    const byCode = await app.inject({ url: "/v1/reference/ncm?date=2027-01-01&q=2203" })
    expect(byCode.json<{ data: { total: number } }>().data.total).toBe(1)
  })

  it("maps engine failures to generic problem details and does not cache them", async () => {
    const getAliquotaMunicipio = vi
      .fn<ReferenceEngine["getAliquotaMunicipio"]>()
      .mockResolvedValueOnce({ ok: false, error: { kind: "timeout", timeoutMs: 1000 } })
      .mockResolvedValueOnce({
        ok: false,
        error: { kind: "problem", status: 500, detail: "secret engine body", errors: [] },
      })
      .mockResolvedValueOnce({ ok: false, error: { kind: "http", status: 404 } })
    const { app } = await start(fakeEngine({ getAliquotaMunicipio }))
    const url = "/v1/reference/rates/municipalities/3304557?date=2027-01-01"
    const statuses = []
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({ url })
      expect(problemSchema.parse(res.json()).detail).not.toContain("secret")
      statuses.push(res.statusCode)
    }
    expect(statuses).toEqual([504, 502, 404])
  })

  it("answers 503 when the engine URL is not configured", async () => {
    const { app } = await start()
    const res = await app.inject({ url: "/v1/reference/cst" })
    expect(res.statusCode).toBe(503)
    expect(problemSchema.parse(res.json()).status).toBe(503)
  })

  it("rejects invalid codes and dates with 400", async () => {
    const engine = fakeEngine()
    const { app } = await start(engine)
    for (const url of ["/v1/reference/ncm/123", "/v1/reference/cst?date=2027-13-40"]) {
      expect((await app.inject({ url })).statusCode).toBe(400)
    }
    expect(engine.getNcm).not.toHaveBeenCalled()
  })

  it("requires a signed-in office in the full app", async () => {
    const app = await buildApp(
      loadConfig({ ...TEST_ENV, ENGINE_REGIME_REGULAR_URL: "http://127.0.0.1:1" }),
    )
    closeApp = () => app.close()
    const res = await app.inject({ url: "/v1/reference/cst" })
    expect(res.statusCode).toBe(401)
  })
})

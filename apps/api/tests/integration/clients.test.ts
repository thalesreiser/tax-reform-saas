import { randomUUID } from "node:crypto"
import fastifyRateLimit from "@fastify/rate-limit"
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify"
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { OfficeRole } from "../../src/auth/roles.js"
import { CnpjLookup, fromBrasilApi } from "../../src/clients/lookup.js"
import { errorHandler } from "../../src/problem.js"
import { clientRoutes } from "../../src/routes/clients.js"
import { type TestDatabase, createOffice, pgErrorCode, setupTestDatabase } from "./database.js"

// Fictional companies and generated CNPJs only.
const CNPJ_A = "11222333000181"
const CNPJ_ALPHA = "12ABC34501DE35"
const CNPJ_OTHER = "ABCDEFGH000195"
const CHECK_VIOLATION = "23514"

let db: TestDatabase
let app: FastifyInstance
let officeA: string
let officeB: string
const user = randomUUID()

const registry = {
  cnpj: CNPJ_ALPHA,
  razao_social: "EMPRESA ALFANUMERICA FICTICIA LTDA",
  nome_fantasia: "ALFA EXEMPLO",
  logradouro: "RUA DOS TESTES",
  municipio: "CIDADE EXEMPLO",
  uf: "RJ",
  cnae_fiscal: 6201501,
  cnae_fiscal_descricao: "Desenvolvimento de programas de computador sob encomenda",
  cnaes_secundarios: [{ codigo: 6202300, descricao: "Software customizável" }],
  descricao_situacao_cadastral: "ATIVA",
  opcao_pelo_simples: false,
  opcao_pelo_mei: false,
}

beforeAll(async () => {
  db = await setupTestDatabase()
  officeA = await createOffice(db.app, "Escritório Clientes A")
  officeB = await createOffice(db.app, "Escritório Clientes B")
  app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  await app.register(fastifyRateLimit, { global: false })
  app.decorateRequest("office", null)
  // Stand-in for app.requireOffice (covered by auth.test.ts): office and role from test headers.
  const authenticate = (request: FastifyRequest) => {
    request.office = {
      id: String(request.headers["x-office"]),
      role: String(request.headers["x-role"]) as OfficeRole,
      userId: user,
    }
    return Promise.resolve(undefined)
  }
  const lookup = new CnpjLookup({
    name: "fake",
    fetch: () => Promise.resolve(fromBrasilApi(registry, new Date())),
  })
  await app.register(clientRoutes, { db: db.app, lookup, authenticate: [authenticate] })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await db.close()
})

function call(
  office: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  payload?: object,
  role: OfficeRole = "owner",
) {
  return app.inject({
    method,
    url,
    headers: { "x-office": office, "x-role": role },
    ...(payload === undefined ? {} : { payload }),
  })
}

async function events(resourceId: string) {
  const res = await db.admin.query<{ action: string; metadata: unknown; office_id: string }>(
    "select action, metadata, office_id from audit_events where resource_id = $1 order by occurred_at",
    [resourceId],
  )
  return res.rows
}

describe("clients CRUD (RF-02)", () => {
  let id: string

  it("creates a client from the lookup and audits it in the same transaction", async () => {
    const res = await call(officeA, "POST", "/v1/clients", {
      cnpj: "12.abc.345/01de-35",
      lookup: true,
    })
    expect(res.statusCode).toBe(201)
    const body = res.json<Record<string, unknown> & { id: string }>()
    expect(body).toMatchObject({
      cnpj: CNPJ_ALPHA,
      legalName: "EMPRESA ALFANUMERICA FICTICIA LTDA",
      tradeName: "ALFA EXEMPLO",
      mainCnae: "6201501",
      secondaryCnaes: ["6202300"],
      registrationStatus: "ATIVA",
      taxRegime: "unknown",
      lookup: { source: "brasilapi" },
    })
    id = body.id
    expect(await events(id)).toEqual([
      { action: "client.created", metadata: {}, office_id: officeA },
    ])
  })

  it("rejects a duplicate CNPJ in the same office with 409, allows it in another", async () => {
    const dup = await call(officeA, "POST", "/v1/clients", { cnpj: CNPJ_ALPHA, legalName: "Outra" })
    expect(dup.statusCode).toBe(409)
    const other = await call(officeB, "POST", "/v1/clients", { cnpj: CNPJ_ALPHA, legalName: "B" })
    expect(other.statusCode).toBe(201)
  })

  it("creates a client by hand, as an accountant", async () => {
    const res = await call(
      officeA,
      "POST",
      "/v1/clients",
      { cnpj: CNPJ_A, legalName: "Comércio Fictício Ltda", notes: "Cliente de teste" },
      "accountant",
    )
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ lookup: null, notes: "Cliente de teste", address: null })
  })

  it("lists only the office's clients, with search and pagination", async () => {
    const all = await call(officeA, "GET", "/v1/clients")
    expect(all.json()).toMatchObject({ total: 2, page: 1 })
    const byName = await call(officeA, "GET", "/v1/clients?q=com")
    expect(byName.json<{ items: { cnpj: string }[] }>().items.map((c) => c.cnpj)).toEqual([CNPJ_A])
    const byCnpj = await call(officeA, "GET", "/v1/clients?q=12.abc")
    expect(byCnpj.json<{ items: { cnpj: string }[] }>().items.map((c) => c.cnpj)).toEqual([
      CNPJ_ALPHA,
    ])
    const wildcard = await call(officeA, "GET", "/v1/clients?q=%25")
    expect(wildcard.json()).toMatchObject({ total: 0 })
    const page = await call(officeA, "GET", "/v1/clients?pageSize=1&page=2")
    expect(page.json<{ items: unknown[] }>().items).toHaveLength(1)
    expect((await call(officeB, "GET", "/v1/clients")).json()).toMatchObject({ total: 1 })
  })

  it("updates names and notes and audits only the field names", async () => {
    const res = await call(officeA, "PATCH", `/v1/clients/${id}`, {
      tradeName: "Novo Nome",
      notes: null,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ tradeName: "Novo Nome", notes: null })
    expect((await events(id)).at(-1)).toEqual({
      action: "client.updated",
      metadata: { fields: ["tradeName", "notes"] },
      office_id: officeA,
    })
  })

  it("does not let another office read, change or delete the client", async () => {
    expect((await call(officeB, "GET", `/v1/clients/${id}`)).statusCode).toBe(404)
    expect((await call(officeB, "PATCH", `/v1/clients/${id}`, { notes: "x" })).statusCode).toBe(404)
    expect((await call(officeB, "DELETE", `/v1/clients/${id}`)).statusCode).toBe(404)
    expect((await call(officeA, "GET", `/v1/clients/${id}`)).statusCode).toBe(200)
    expect(await events(id)).toHaveLength(2)
  })

  it("hard-deletes the client and keeps the audit trail", async () => {
    const res = await call(officeA, "DELETE", `/v1/clients/${id}`, undefined, "accountant")
    expect(res.statusCode).toBe(204)
    expect((await call(officeA, "GET", `/v1/clients/${id}`)).statusCode).toBe(404)
    const row = await db.admin.query("select 1 from clients where id = $1", [id])
    expect(row.rowCount).toBe(0)
    expect((await events(id)).map((e) => e.action)).toEqual([
      "client.created",
      "client.updated",
      "client.deleted",
    ])
  })
})

describe("clients table constraints", () => {
  it.each(["11222333000a81", "1122233300018X", "short", "11.222.333/00"])(
    "rejects a malformed CNPJ (%s)",
    async (cnpj) => {
      const run = db.admin.query(
        "insert into clients (office_id, cnpj, legal_name) values ($1, $2, 'X')",
        [officeA, cnpj.padEnd(14, " ").slice(0, 14)],
      )
      expect(await run.then(() => "inserted", pgErrorCode)).toBe(CHECK_VIOLATION)
    },
  )

  it("accepts a well-formed alphanumeric CNPJ", async () => {
    await db.admin.query(
      "insert into clients (office_id, cnpj, legal_name) values ($1, $2, 'Fictícia')",
      [officeB, CNPJ_OTHER],
    )
  })
})

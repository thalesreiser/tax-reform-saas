import { randomUUID } from "node:crypto"
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify"
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { OfficeRole } from "../../src/auth/roles.js"
import { withOffice } from "../../src/db/client.js"
import { clientSalesMix } from "../../src/db/schema.js"
import { errorHandler } from "../../src/problem.js"
import { fiscalProfileRoutes } from "../../src/routes/fiscal-profile.js"
import {
  type TestDatabase,
  createClient,
  createOffice,
  pgErrorCode,
  setupTestDatabase,
} from "./database.js"

// Fictional companies, generated CNPJs and example values only.
let db: TestDatabase
let app: FastifyInstance
let officeA: string
let officeB: string
let clientA: string
const owner = randomUUID()
const accountant = randomUUID()

const profile = {
  regime: "lucro_presumido",
  regimeConfirmed: true,
  mainCnae: "6201501",
  uf: "RJ",
  municipalityCode: "3304557",
  revenue12m: "1200000",
  salesMix: [
    {
      operationType: "services",
      nbs: "101011000",
      sharePercent: "100",
      cClassTrib: "000001",
      destination: "intrastate",
    },
  ],
  creditablePurchases: [{ category: "energy", amount: "2400.5" }],
}

beforeAll(async () => {
  db = await setupTestDatabase()
  officeA = await createOffice(db.app, "Escritório Perfil A")
  officeB = await createOffice(db.app, "Escritório Perfil B")
  clientA = await createClient(db.app, officeA, {
    cnpj: "TESTPF00000001",
    legalName: "Empresa Perfil Fictícia",
  })
  app = Fastify({ genReqId: () => randomUUID() })
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  app.decorateRequest("office", null)
  const authenticate = (request: FastifyRequest) => {
    const role = String(request.headers["x-role"]) as OfficeRole
    request.office = {
      id: String(request.headers["x-office"]),
      role,
      userId: role === "owner" ? owner : accountant,
    }
    return Promise.resolve(undefined)
  }
  await app.register(fiscalProfileRoutes, { db: db.app, authenticate: [authenticate] })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await db.close()
})

function call(
  office: string,
  method: "GET" | "PUT",
  path = "",
  options: { payload?: object; ifMatch?: string; role?: OfficeRole } = {},
) {
  return app.inject({
    method,
    url: `/v1/clients/${clientA}/fiscal-profile${path}`,
    headers: {
      "x-office": office,
      "x-role": options.role ?? "owner",
      ...(options.ifMatch === undefined ? {} : { "if-match": options.ifMatch }),
    },
    ...(options.payload === undefined ? {} : { payload: options.payload }),
  })
}

async function events() {
  const res = await db.admin.query<{ action: string; metadata: unknown; actor_user_id: string }>(
    "select action, metadata, actor_user_id from audit_events where resource_id = $1 order by occurred_at, action",
    [clientA],
  )
  return res.rows
}

describe("fiscal profile (RF-03)", () => {
  it("returns a version-0 draft before the first save", async () => {
    const res = await call(officeA, "GET")
    expect(res.statusCode).toBe(200)
    expect(res.headers.etag).toBe('"0"')
    expect(res.json()).toMatchObject({ version: 0, regime: null, salesMix: [] })
  })

  it("says what is missing for an incomplete profile", async () => {
    const res = await call(officeA, "GET", "/completeness")
    expect(res.statusCode).toBe(200)
    const body = res.json<{ complete: boolean; needs: { currentTaxes: { field: string }[] } }>()
    expect(body.complete).toBe(false)
    expect(body.needs.currentTaxes.map((i) => i.field)).toContain("regime")
  })

  it("requires If-Match", async () => {
    expect((await call(officeA, "PUT", "", { payload: profile })).statusCode).toBe(428)
  })

  it("saves, normalizes decimals and audits names and counts only", async () => {
    const res = await call(officeA, "PUT", "", { payload: profile, ifMatch: '"0"' })
    expect(res.statusCode).toBe(200)
    expect(res.headers.etag).toBe('"1"')
    expect(res.json()).toMatchObject({
      version: 1,
      regime: "lucro_presumido",
      regimeConfirmed: true,
      regimeConfirmation: { by: owner },
      revenue12m: "1200000.00",
      salesMix: [{ nbs: "101011000", sharePercent: "100.0000" }],
      creditablePurchases: [{ category: "energy", amount: "2400.50" }],
    })
    const rows = await events()
    expect(rows.map((r) => r.action)).toEqual([
      "client.fiscal_profile_updated",
      "client.regime_confirmed",
    ])
    expect(rows[0]?.metadata).toMatchObject({ salesMixLines: 1, creditablePurchaseLines: 1 })
    const { fields } = rows[0]?.metadata as { fields: string[] }
    expect(fields).toEqual(
      expect.arrayContaining(["regime", "revenue12m", "salesMix", "regimeConfirmation"]) as unknown,
    )
    expect(JSON.stringify(rows)).not.toContain("1200000")
    expect(rows[1]?.metadata).toEqual({ regime: "lucro_presumido" })
  })

  it("round-trips through GET", async () => {
    const res = await call(officeA, "GET")
    expect(res.headers.etag).toBe('"1"')
    expect(res.json()).toMatchObject({ version: 1, municipalityCode: "3304557" })
  })

  it("rejects a stale version with 412", async () => {
    const res = await call(officeA, "PUT", "", { payload: profile, ifMatch: '"0"' })
    expect(res.statusCode).toBe(412)
  })

  it("lets an accountant edit, keeping the confirmation while the regime is unchanged", async () => {
    const res = await call(officeA, "PUT", "", {
      payload: { ...profile, revenue12m: "1300000.00" },
      ifMatch: '"1"',
      role: "accountant",
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ version: 2, regimeConfirmation: { by: owner } })
    const last = (await events()).at(-1)
    expect(last).toMatchObject({
      action: "client.fiscal_profile_updated",
      actor_user_id: accountant,
      metadata: { fields: ["revenue12m"] },
    })
  })

  it("does not bump the version for an unchanged profile", async () => {
    const res = await call(officeA, "PUT", "", {
      payload: { ...profile, revenue12m: "1300000" },
      ifMatch: '"2"',
    })
    expect(res.json()).toMatchObject({ version: 2 })
  })

  it("rejects shares that do not total 100", async () => {
    const line = { ...profile.salesMix[0], sharePercent: "99.98" }
    const res = await call(officeA, "PUT", "", {
      payload: { ...profile, salesMix: [line] },
      ifMatch: '"2"',
    })
    expect(res.statusCode).toBe(400)
  })
})

describe("office isolation (RNF-02)", () => {
  it("hides the profile from another office", async () => {
    expect((await call(officeB, "GET")).statusCode).toBe(404)
    expect((await call(officeB, "GET", "/completeness")).statusCode).toBe(404)
    const put = await call(officeB, "PUT", "", { payload: profile, ifMatch: '"0"' })
    expect(put.statusCode).toBe(404)
  })

  it("reads no lines of another office and cannot write them", async () => {
    const rows = await withOffice(db.app, officeB, (tx) => tx.select().from(clientSalesMix))
    expect(rows).toEqual([])
    const error = await withOffice(db.app, officeB, (tx) =>
      tx.insert(clientSalesMix).values({
        officeId: officeA,
        clientId: clientA,
        position: 9,
        operationType: "goods",
        destination: "intrastate",
      }),
    ).catch((e: unknown) => e)
    expect(pgErrorCode(error)).toBe("42501")
  })

  it("deletes the profile and its lines with the client", async () => {
    await db.admin.query("delete from clients where id = $1", [clientA])
    const left = await db.admin.query(
      "select 1 from client_fiscal_profiles where client_id = $1 union all select 1 from client_sales_mix where client_id = $1",
      [clientA],
    )
    expect(left.rowCount).toBe(0)
  })
})

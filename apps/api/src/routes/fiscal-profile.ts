import { asc, eq } from "drizzle-orm"
import { dec, format } from "@trs/tax-legacy"
import type { FastifyRequest } from "fastify"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod"
import { PROFILE_FIELDS, recordAudit } from "../audit/events.js"
import { auditContext } from "../audit/request.js"
import { currentOffice } from "../auth/plugin.js"
import {
  CODE_FORMATS,
  type FiscalProfileInput,
  PROFILE_NEEDS,
  type ProfileForCompleteness,
  UFS,
  UF_IBGE,
  fiscalProfileInputSchema,
  profileCompleteness,
  purchaseLineSchema,
  salesMixLineSchema,
} from "../clients/fiscal-profile.js"
import { type Db, type OfficeTx, withOffice } from "../db/client.js"
import {
  FISCAL_REGIMES,
  clientCreditablePurchases,
  clientFiscalProfiles,
  clientSalesMix,
  clients,
} from "../db/schema.js"
import { problemSchema } from "../problem.js"
import type { Authenticate } from "./reference.js"

export interface FiscalProfileRoutesOptions {
  db: Db
  authenticate: Authenticate[]
}

const idParams = z.object({ id: z.uuid() })
const authErrors = { 400: problemSchema, 401: problemSchema, 403: problemSchema }
const httpError = (status: number, message: string) =>
  Object.assign(new Error(message), { statusCode: status })

type MixLine = z.output<typeof salesMixLineSchema>
type PurchaseLine = z.output<typeof purchaseLineSchema>

const nullableText = z.string().nullable()
export const fiscalProfileSchema = z.object({
  clientId: z.uuid(),
  /** 0 while the client has no stored profile (the body is a draft from the registry). */
  version: z.number().int(),
  regime: z.enum(FISCAL_REGIMES).nullable(),
  /** The registry's hint (`mei`, `simples_nacional`, `unknown`); never used as the regime. */
  regimeHint: nullableText,
  regimeConfirmed: z.boolean(),
  regimeConfirmation: z.object({ by: z.uuid(), at: z.iso.datetime() }).nullable(),
  simplesAnnex: nullableText,
  rbt12: nullableText,
  mainCnae: nullableText,
  secondaryCnaes: z.array(z.string()),
  uf: nullableText,
  municipalityCode: nullableText,
  revenue12m: nullableText,
  payroll12m: nullableText,
  salesMix: z.array(
    z.object({
      operationType: z.string(),
      ncm: nullableText,
      nbs: nullableText,
      description: nullableText,
      sharePercent: nullableText,
      amount: nullableText,
      cst: nullableText,
      cClassTrib: nullableText,
      destination: z.string(),
    }),
  ),
  creditablePurchases: z.array(
    z.object({ category: z.string(), description: nullableText, amount: z.string() }),
  ),
  updatedAt: z.iso.datetime().nullable(),
})
type FiscalProfile = z.output<typeof fiscalProfileSchema>

const issueSchema = z.object({
  field: z.string(),
  problem: z.enum(["missing", "invalid", "unconfirmed"]),
  detail: z.string().optional(),
})
const completenessSchema = z.object({
  complete: z.boolean(),
  needs: z.object(Object.fromEntries(PROFILE_NEEDS.map((n) => [n, z.array(issueSchema)]))),
  referenceCheck: z.literal("not_verified"),
})

const toAmountText = (v: string | null) => (v === null ? null : format(dec(v), 2))
const toPercentText = (v: string | null) => (v === null ? null : format(dec(v), 4))

/** Same text form as Postgres numeric(15, 2) / numeric(7, 4), so values compare as stored. */
function normalize(input: FiscalProfileInput): FiscalProfileInput {
  return {
    ...input,
    rbt12: toAmountText(input.rbt12),
    revenue12m: toAmountText(input.revenue12m),
    payroll12m: toAmountText(input.payroll12m),
    salesMix: input.salesMix.map((l) => ({
      ...l,
      sharePercent: toPercentText(l.sharePercent),
      amount: toAmountText(l.amount),
    })),
    creditablePurchases: input.creditablePurchases.map((l) => ({
      ...l,
      amount: format(dec(l.amount), 2),
    })),
  }
}

/** The stored profile, or a version-0 draft from the registry fields of the client. */
async function load(tx: OfficeTx, clientId: string, lock = false): Promise<FiscalProfile> {
  const [client] = await tx.select().from(clients).where(eq(clients.id, clientId))
  if (client === undefined) throw httpError(404, "Client not found.")
  const query = tx
    .select()
    .from(clientFiscalProfiles)
    .where(eq(clientFiscalProfiles.clientId, clientId))
  const [row] = lock ? await query.for("update") : await query
  if (row === undefined) {
    const state = client.address?.state ?? null
    const ibge = client.address?.ibgeCode ?? null
    const uf = UFS.find((u) => u === state) ?? null
    const validIbge =
      ibge !== null &&
      uf !== null &&
      CODE_FORMATS.municipality.test(ibge) &&
      ibge.startsWith(UF_IBGE[uf])
    return {
      clientId,
      version: 0,
      regime: null,
      regimeHint: client.taxRegime,
      regimeConfirmed: false,
      regimeConfirmation: null,
      simplesAnnex: null,
      rbt12: null,
      mainCnae: client.mainCnae,
      secondaryCnaes: client.secondaryCnaes,
      uf,
      municipalityCode: validIbge ? ibge : null,
      revenue12m: null,
      payroll12m: null,
      salesMix: [],
      creditablePurchases: [],
      updatedAt: null,
    }
  }
  const mix = await tx
    .select()
    .from(clientSalesMix)
    .where(eq(clientSalesMix.clientId, clientId))
    .orderBy(asc(clientSalesMix.position))
  const purchases = await tx
    .select()
    .from(clientCreditablePurchases)
    .where(eq(clientCreditablePurchases.clientId, clientId))
    .orderBy(asc(clientCreditablePurchases.position))
  const confirmed = row.confirmedBy !== null && row.confirmedAt !== null
  return {
    clientId,
    version: row.version,
    regime: FISCAL_REGIMES.find((r) => r === row.regime) ?? null,
    regimeHint: client.taxRegime,
    regimeConfirmed: confirmed,
    regimeConfirmation:
      row.confirmedBy !== null && row.confirmedAt !== null
        ? { by: row.confirmedBy, at: row.confirmedAt.toISOString() }
        : null,
    simplesAnnex: row.simplesAnnex,
    rbt12: row.rbt12,
    mainCnae: row.mainCnae,
    secondaryCnaes: row.secondaryCnaes,
    uf: row.uf,
    municipalityCode: row.municipalityCode,
    revenue12m: row.revenue12m,
    payroll12m: row.payroll12m,
    salesMix: mix.map((l) => ({
      operationType: l.operationType,
      ncm: l.ncm,
      nbs: l.nbs,
      description: l.description,
      sharePercent: l.sharePercent,
      amount: l.amount,
      cst: l.cst,
      cClassTrib: l.cClassTrib,
      destination: l.destination,
    })),
    creditablePurchases: purchases.map((l) => ({
      category: l.category,
      description: l.description,
      amount: l.amount,
    })),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** The stored profile as completeness reads it (a draft counts as not stored). */
export function forCompleteness(profile: FiscalProfile): ProfileForCompleteness | null {
  if (profile.version === 0) return null
  const { regime, simplesAnnex, rbt12, mainCnae, secondaryCnaes, uf, municipalityCode } = profile
  const { revenue12m, payroll12m, salesMix, creditablePurchases } = profile
  const parsed = fiscalProfileInputSchema.safeParse({
    regime,
    simplesAnnex,
    rbt12,
    mainCnae,
    secondaryCnaes,
    uf,
    municipalityCode,
    revenue12m,
    payroll12m,
    salesMix,
    creditablePurchases,
  })
  // Stored rows passed the same schema; a row that no longer does is treated as missing data.
  if (!parsed.success) return null
  return { ...parsed.data, regimeConfirmedAt: profile.regimeConfirmation?.at ?? null }
}

const SCALAR_FIELDS = [
  "regime",
  "simplesAnnex",
  "rbt12",
  "mainCnae",
  "uf",
  "municipalityCode",
  "revenue12m",
  "payroll12m",
] as const

function changedFields(
  before: FiscalProfile,
  after: FiscalProfileInput,
  confirmationChanged: boolean,
): (typeof PROFILE_FIELDS)[number][] {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const fields: (typeof PROFILE_FIELDS)[number][] = SCALAR_FIELDS.filter(
    (f) => (before[f] ?? null) !== after[f],
  )
  if (!same(before.secondaryCnaes, after.secondaryCnaes)) fields.push("secondaryCnaes")
  if (!same(before.salesMix, after.salesMix)) fields.push("salesMix")
  if (!same(before.creditablePurchases, after.creditablePurchases)) {
    fields.push("creditablePurchases")
  }
  if (confirmationChanged) fields.push("regimeConfirmation")
  return fields
}

/** `"3"` or `3` from If-Match; undefined when absent or malformed. */
function ifMatchVersion(request: FastifyRequest): number | undefined {
  const raw = request.headers["if-match"]
  const match = typeof raw === "string" ? /^(?:W\/)?"?(\d{1,9})"?$/.exec(raw.trim()) : null
  return match?.[1] === undefined ? undefined : Number(match[1])
}

const etag = (version: number) => `"${String(version)}"`

/**
 * Fiscal profile of a client (RF-03, BE-02.3). Owners and accountants have the same access. The
 * whole profile is replaced by PUT with optimistic concurrency (ETag = version, If-Match
 * required: 428 without it, 412 on a stale version). Audit metadata carries field names and
 * line counts only, never values.
 */
export const fiscalProfileRoutes: FastifyPluginAsyncZod<FiscalProfileRoutesOptions> = (
  app,
  options,
) => {
  const { db } = options
  const preHandler = options.authenticate

  // Fiscal data: the request log shows the route pattern, never the URL or the body.
  app.addHook("onRoute", (route) => {
    route.logSerializers = {
      ...route.logSerializers,
      req: (req: FastifyRequest) => `${req.method} ${route.url}`,
    }
  })

  app.get(
    "/v1/clients/:id/fiscal-profile",
    {
      preHandler,
      schema: {
        tags: ["clients"],
        summary: "Fiscal profile of a client (a version-0 draft when none is stored)",
        params: idParams,
        response: { 200: fiscalProfileSchema, ...authErrors, 404: problemSchema },
      },
    },
    async (request, reply) => {
      const profile = await withOffice(db, currentOffice(request).id, (tx) =>
        load(tx, request.params.id),
      )
      return reply.header("etag", etag(profile.version)).send(profile)
    },
  )

  app.put(
    "/v1/clients/:id/fiscal-profile",
    {
      preHandler,
      schema: {
        tags: ["clients"],
        summary: "Replace the fiscal profile (If-Match: the version from GET; 0 for the first)",
        params: idParams,
        body: fiscalProfileInputSchema,
        response: {
          200: fiscalProfileSchema,
          ...authErrors,
          404: problemSchema,
          412: problemSchema,
          428: problemSchema,
        },
      },
    },
    async (request, reply) => {
      const expected = ifMatchVersion(request)
      if (expected === undefined) {
        throw httpError(428, "Send If-Match with the version from GET (0 for a new profile).")
      }
      const input = normalize(request.body)
      const office = currentOffice(request)
      const clientId = request.params.id
      const profile = await withOffice(db, office.id, async (tx) => {
        const before = await load(tx, clientId, true)
        if (before.version !== expected) {
          throw httpError(412, "The profile changed since it was read. Reload and try again.")
        }
        const regimeChanged = before.regime !== input.regime
        const confirm = input.regimeConfirmed && (regimeChanged || !before.regimeConfirmed)
        const unconfirm = before.regimeConfirmed && (!input.regimeConfirmed || regimeChanged)
        const fields = changedFields(before, input, confirm || unconfirm)
        if (fields.length === 0 && before.version > 0) return before

        const now = new Date()
        const confirmation = confirm
          ? { confirmedBy: office.userId, confirmedAt: now }
          : unconfirm
            ? { confirmedBy: null, confirmedAt: null }
            : {}
        const values = {
          regime: input.regime,
          simplesAnnex: input.simplesAnnex,
          rbt12: input.rbt12,
          mainCnae: input.mainCnae,
          secondaryCnaes: input.secondaryCnaes,
          uf: input.uf,
          municipalityCode: input.municipalityCode,
          revenue12m: input.revenue12m,
          payroll12m: input.payroll12m,
          ...confirmation,
          version: before.version + 1,
          updatedAt: now,
        }
        if (before.version === 0) {
          await tx.insert(clientFiscalProfiles).values({ ...values, clientId, officeId: office.id })
        } else {
          await tx
            .update(clientFiscalProfiles)
            .set(values)
            .where(eq(clientFiscalProfiles.clientId, clientId))
        }
        await replaceLines(tx, office.id, clientId, input.salesMix, input.creditablePurchases)
        await recordAudit(tx, {
          action: "client.fiscal_profile_updated",
          resourceId: clientId,
          metadata: {
            fields,
            salesMixLines: input.salesMix.length,
            creditablePurchaseLines: input.creditablePurchases.length,
          },
          ...auditContext(request),
        })
        if (confirm && input.regime !== null) {
          await recordAudit(tx, {
            action: "client.regime_confirmed",
            resourceId: clientId,
            metadata: { regime: input.regime },
            ...auditContext(request),
          })
        }
        return load(tx, clientId)
      })
      return reply.header("etag", etag(profile.version)).send(profile)
    },
  )

  app.get(
    "/v1/clients/:id/fiscal-profile/completeness",
    {
      preHandler,
      schema: {
        tags: ["clients"],
        summary: "Missing or invalid profile fields per simulation need",
        params: idParams,
        response: { 200: completenessSchema, ...authErrors, 404: problemSchema },
      },
    },
    async (request) => {
      const profile = await withOffice(db, currentOffice(request).id, (tx) =>
        load(tx, request.params.id),
      )
      return profileCompleteness(forCompleteness(profile))
    },
  )

  return Promise.resolve()
}

async function replaceLines(
  tx: OfficeTx,
  officeId: string,
  clientId: string,
  mix: MixLine[],
  purchases: PurchaseLine[],
): Promise<void> {
  await tx.delete(clientSalesMix).where(eq(clientSalesMix.clientId, clientId))
  await tx.delete(clientCreditablePurchases).where(eq(clientCreditablePurchases.clientId, clientId))
  if (mix.length > 0) {
    await tx
      .insert(clientSalesMix)
      .values(mix.map((l, position) => ({ ...l, officeId, clientId, position })))
  }
  if (purchases.length > 0) {
    await tx
      .insert(clientCreditablePurchases)
      .values(purchases.map((l, position) => ({ ...l, officeId, clientId, position })))
  }
}

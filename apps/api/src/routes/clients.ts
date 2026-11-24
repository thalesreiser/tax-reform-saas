import { asc, count, eq, ilike, like, or } from "drizzle-orm"
import type { FastifyReply, FastifyRequest } from "fastify"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod"
import { recordAudit } from "../audit/events.js"
import { auditContext } from "../audit/request.js"
import { currentOffice } from "../auth/plugin.js"
import { cnpjSchema, normalizeCnpj } from "../clients/cnpj.js"
import {
  type CnpjLookup,
  CnpjLookupError,
  type CnpjRecord,
  cnpjRecordSchema,
} from "../clients/lookup.js"
import { type Db, withOffice } from "../db/client.js"
import { clients } from "../db/schema.js"
import { problem, problemSchema, sendProblem } from "../problem.js"
import type { Authenticate } from "./reference.js"

export const CLIENT_PAGE_SIZE = { default: 50, max: 100 } as const
/** CNPJ lookups per office per minute (cache hits included). */
export const LOOKUP_LIMIT = { max: 30, timeWindow: 60_000 } as const

export interface ClientRoutesOptions {
  db: Db
  lookup: CnpjLookup
  /** Today the office session (`app.requireOffice`); it must set `request.office`. */
  authenticate: Authenticate[]
}

const name = z.string().trim().min(1).max(200)
const notes = z.string().trim().max(2000)

export const clientSchema = z.object({
  id: z.uuid(),
  cnpj: z.string(),
  legalName: z.string(),
  tradeName: z.string().nullable(),
  address: cnpjRecordSchema.shape.address.nullable(),
  mainCnae: z.string().nullable(),
  secondaryCnaes: z.array(z.string()),
  registrationStatus: z.string().nullable(),
  taxRegime: z.string().nullable(),
  lookup: z.object({ source: z.string(), fetchedAt: z.iso.datetime() }).nullable(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const createClientSchema = z.object({
  cnpj: cnpjSchema,
  /** Required unless `lookup` fills it. */
  legalName: name.optional(),
  tradeName: name.optional(),
  notes: notes.optional(),
  /** Fill the registry fields from the CNPJ lookup (names sent here win). */
  lookup: z.boolean().default(false),
})

export const updateClientSchema = z
  .strictObject({
    legalName: name.optional(),
    tradeName: name.nullable().optional(),
    notes: notes.nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "Send at least one field")

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional().describe("Part of the name or start of the CNPJ"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(CLIENT_PAGE_SIZE.max)
    .default(CLIENT_PAGE_SIZE.default),
})
const idParams = z.object({ id: z.uuid() })

type Row = typeof clients.$inferSelect

export function toClient(row: Row): z.output<typeof clientSchema> {
  return {
    id: row.id,
    cnpj: row.cnpj,
    legalName: row.legalName,
    tradeName: row.tradeName,
    address: row.address,
    mainCnae: row.mainCnae,
    secondaryCnaes: row.secondaryCnaes,
    registrationStatus: row.registrationStatus,
    taxRegime: row.taxRegime,
    lookup:
      row.lookupSource === null || row.lookupFetchedAt === null
        ? null
        : { source: row.lookupSource, fetchedAt: row.lookupFetchedAt.toISOString() },
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function registryFields(record: CnpjRecord) {
  return {
    tradeName: record.tradeName,
    address: record.address,
    mainCnae: record.mainCnae?.code ?? null,
    secondaryCnaes: record.secondaryCnaes.map((c) => c.code),
    registrationStatus: record.registrationStatus,
    taxRegime: record.taxRegime,
    lookupSource: record.source,
    lookupFetchedAt: new Date(record.fetchedAt),
  }
}

/** True for a unique violation of the office's CNPJ, also when wrapped by Drizzle. */
function isDuplicateCnpj(error: unknown): boolean {
  let current: unknown = error
  while (current instanceof Error) {
    if ("constraint" in current && current.constraint === "clients_office_id_cnpj_key") return true
    current = current.cause
  }
  return false
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => "\\" + c)
const httpError = (status: number, message: string) =>
  Object.assign(new Error(message), { statusCode: status })

const authErrors = { 400: problemSchema, 401: problemSchema, 403: problemSchema }
const lookupErrors = {
  429: problemSchema,
  502: problemSchema,
  504: problemSchema,
}

/**
 * Clients of the active office (RF-02) and the CNPJ lookup. Every query runs in `withOffice`
 * (row-level security); every change writes its audit event in the same transaction (RF-18).
 * Owners and accountants have the same access.
 */
export const clientRoutes: FastifyPluginAsyncZod<ClientRoutesOptions> = (app, options) => {
  const { db, lookup } = options
  const perOffice = app.createRateLimit({
    max: LOOKUP_LIMIT.max,
    timeWindow: LOOKUP_LIMIT.timeWindow,
    keyGenerator: (request) => `cnpj-lookup:${currentOffice(request).id}`,
  })

  // CNPJs and names are fiscal data: the request log shows the route pattern, never the URL.
  app.addHook("onRoute", (route) => {
    route.logSerializers = {
      ...route.logSerializers,
      req: (req: FastifyRequest) => `${req.method} ${route.url}`,
    }
  })

  /** The registry record, or undefined after sending a problem (rate limit, provider failure). */
  async function lookUp(
    request: FastifyRequest,
    reply: FastifyReply,
    cnpj: string,
    notFoundStatus: 404 | 422,
  ): Promise<CnpjRecord | undefined> {
    const limit = await perOffice(request)
    if (!limit.isAllowed && limit.isExceeded) {
      reply.header("retry-after", String(limit.ttlInSeconds))
      await sendProblem(
        reply,
        problem(request, 429, { detail: "Too many lookups. Try again later." }),
      )
      return undefined
    }
    try {
      return await lookup.get(cnpj)
    } catch (error) {
      if (!(error instanceof CnpjLookupError)) throw error
      // Kind and status only: never the CNPJ, never the provider's body.
      request.log.warn({ lookupError: error.kind, status: error.status }, "CNPJ lookup failed")
      const status =
        error.kind === "not_found" ? notFoundStatus : error.kind === "timeout" ? 504 : 502
      const detail =
        error.kind === "not_found"
          ? "CNPJ not found in the registry."
          : "The CNPJ registry did not answer. Try again."
      await sendProblem(reply, problem(request, status, { detail }))
      return undefined
    }
  }

  const preHandler = options.authenticate

  app.get(
    "/v1/cnpj/:cnpj",
    {
      preHandler,
      schema: {
        tags: ["clients"],
        summary: "Registry data of a CNPJ (BrasilAPI)",
        params: z.object({ cnpj: cnpjSchema }),
        response: { 200: cnpjRecordSchema, ...authErrors, 404: problemSchema, ...lookupErrors },
      },
    },
    async (request, reply) => {
      const record = await lookUp(request, reply, request.params.cnpj, 404)
      return record === undefined ? reply : reply.send(record)
    },
  )

  app.post(
    "/v1/clients",
    {
      preHandler,
      schema: {
        tags: ["clients"],
        summary: "Create a client, optionally filled from the CNPJ lookup",
        body: createClientSchema,
        response: {
          201: clientSchema,
          ...authErrors,
          409: problemSchema,
          422: problemSchema,
          ...lookupErrors,
        },
      },
    },
    async (request, reply) => {
      const office = currentOffice(request)
      const body = request.body
      let registry: Partial<ReturnType<typeof registryFields>> = {}
      let legalName = body.legalName
      if (body.lookup) {
        const record = await lookUp(request, reply, body.cnpj, 422)
        if (record === undefined) return reply
        registry = registryFields(record)
        legalName ??= record.legalName
      }
      if (legalName === undefined) throw httpError(400, "legalName is required without lookup.")
      try {
        const row = await withOffice(db, office.id, async (tx) => {
          const [created] = await tx
            .insert(clients)
            .values({
              ...registry,
              officeId: office.id,
              cnpj: body.cnpj,
              legalName,
              ...(body.tradeName === undefined ? {} : { tradeName: body.tradeName }),
              notes: body.notes ?? null,
            })
            .returning()
          if (created === undefined) throw new Error("Client was not created.")
          await recordAudit(tx, {
            action: "client.created",
            resourceId: created.id,
            metadata: {},
            ...auditContext(request),
          })
          return created
        })
        return await reply.code(201).send(toClient(row))
      } catch (error) {
        if (isDuplicateCnpj(error)) {
          throw httpError(409, "This office already has a client with this CNPJ.")
        }
        throw error
      }
    },
  )

  app.get(
    "/v1/clients",
    {
      preHandler,
      schema: {
        tags: ["clients"],
        summary: "Clients of the active office",
        querystring: listQuerySchema,
        response: {
          200: z.object({
            items: z.array(clientSchema),
            page: z.number().int(),
            pageSize: z.number().int(),
            total: z.number().int(),
          }),
          ...authErrors,
        },
      },
    },
    async (request) => {
      const { q, page, pageSize } = request.query
      const term = q === undefined || q === "" ? undefined : escapeLike(q)
      const prefix = escapeLike(normalizeCnpj(q ?? ""))
      const where =
        term === undefined
          ? undefined
          : or(
              ilike(clients.legalName, `%${term}%`),
              ilike(clients.tradeName, `%${term}%`),
              prefix === "" ? undefined : like(clients.cnpj, `${prefix}%`),
            )
      const [rows, totals] = await withOffice(db, currentOffice(request).id, async (tx) => {
        const items = await tx
          .select()
          .from(clients)
          .where(where)
          .orderBy(asc(clients.legalName), asc(clients.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize)
        const total = await tx.select({ n: count() }).from(clients).where(where)
        return [items, total] as const
      })
      return { items: rows.map(toClient), page, pageSize, total: totals[0]?.n ?? 0 }
    },
  )

  app.get(
    "/v1/clients/:id",
    {
      preHandler,
      schema: {
        tags: ["clients"],
        summary: "One client",
        params: idParams,
        response: { 200: clientSchema, ...authErrors, 404: problemSchema },
      },
    },
    async (request) => {
      const [row] = await withOffice(db, currentOffice(request).id, (tx) =>
        tx.select().from(clients).where(eq(clients.id, request.params.id)),
      )
      if (row === undefined) throw httpError(404, "Client not found.")
      return toClient(row)
    },
  )

  app.patch(
    "/v1/clients/:id",
    {
      preHandler,
      schema: {
        tags: ["clients"],
        summary: "Update a client's names or notes",
        params: idParams,
        body: updateClientSchema,
        response: { 200: clientSchema, ...authErrors, 404: problemSchema },
      },
    },
    async (request) => {
      const changes = request.body
      const fields = (["legalName", "tradeName", "notes"] as const).filter(
        (f) => changes[f] !== undefined,
      )
      const row = await withOffice(db, currentOffice(request).id, async (tx) => {
        const [updated] = await tx
          .update(clients)
          .set({ ...changes, updatedAt: new Date() })
          .where(eq(clients.id, request.params.id))
          .returning()
        if (updated === undefined) return undefined
        await recordAudit(tx, {
          action: "client.updated",
          resourceId: updated.id,
          metadata: { fields },
          ...auditContext(request),
        })
        return updated
      })
      if (row === undefined) throw httpError(404, "Client not found.")
      return toClient(row)
    },
  )

  app.delete(
    "/v1/clients/:id",
    {
      preHandler,
      schema: {
        tags: ["clients"],
        summary: "Delete a client (hard delete, audited)",
        params: idParams,
        response: { 204: z.null(), ...authErrors, 404: problemSchema },
      },
    },
    async (request, reply) => {
      const deleted = await withOffice(db, currentOffice(request).id, async (tx) => {
        const [row] = await tx
          .delete(clients)
          .where(eq(clients.id, request.params.id))
          .returning({ id: clients.id })
        if (row === undefined) return false
        await recordAudit(tx, {
          action: "client.deleted",
          resourceId: row.id,
          metadata: {},
          ...auditContext(request),
        })
        return true
      })
      if (!deleted) throw httpError(404, "Client not found.")
      return reply.code(204).send(null)
    },
  )

  return Promise.resolve()
}

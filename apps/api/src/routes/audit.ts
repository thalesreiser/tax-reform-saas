import { and, desc, eq, gte, lt, sql } from "drizzle-orm"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod"
import { currentOffice } from "../auth/plugin.js"
import { OFFICE_ROLES } from "../auth/roles.js"
import { type Db, withOffice } from "../db/client.js"
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES, auditEvents } from "../db/schema.js"
import { problemSchema } from "../problem.js"

export const AUDIT_PAGE_SIZE = { default: 50, max: 100 } as const

const cursorSchema = z.tuple([z.iso.datetime(), z.uuid()])

/** Opaque position after an event: its time and id, base64url JSON. */
export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify([at.toISOString(), id])).toString("base64url")
}

/** The position in a cursor, or undefined when it was not made by encodeCursor(). */
export function decodeCursor(cursor: string): { at: Date; id: string } | undefined {
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString()))
    return parsed.success ? { at: new Date(parsed.data[0]), id: parsed.data[1] } : undefined
  } catch {
    return undefined
  }
}

export const auditQuerySchema = z.object({
  action: z.enum(AUDIT_ACTIONS).optional(),
  /** Inclusive. */
  from: z.iso.datetime({ offset: true }).optional(),
  /** Exclusive. */
  to: z.iso.datetime({ offset: true }).optional(),
  cursor: z
    .string()
    .max(200)
    .refine((c) => decodeCursor(c) !== undefined, "Invalid cursor")
    .optional(),
  limit: z.coerce.number().int().min(1).max(AUDIT_PAGE_SIZE.max).default(AUDIT_PAGE_SIZE.default),
})

export const auditEventSchema = z.object({
  id: z.uuid(),
  occurredAt: z.iso.datetime(),
  action: z.enum(AUDIT_ACTIONS),
  /** null: the system. */
  actor: z.object({ userId: z.uuid(), role: z.enum(OFFICE_ROLES).nullable() }).nullable(),
  resource: z.object({ type: z.enum(AUDIT_RESOURCE_TYPES), id: z.uuid() }),
  requestId: z.uuid().nullable(),
  /** Ids, roles and field names only (allow-list per action). */
  metadata: z.record(z.string(), z.unknown()),
})

export const auditPageSchema = z.object({
  items: z.array(auditEventSchema),
  /** Pass as `cursor` for the next (older) page; null on the last page. */
  nextCursor: z.string().nullable(),
})

const actorRole = z.enum(OFFICE_ROLES).nullable()

/** Audit log of the active office, newest first (RF-18). Owner only. */
export const auditRoutes: FastifyPluginAsyncZod<{ db: Db }> = (app, { db }) => {
  app.get(
    "/office/audit",
    {
      preHandler: app.requireOffice,
      schema: {
        tags: ["office"],
        summary: "Audit log of the active office (owner only)",
        querystring: auditQuerySchema,
        response: {
          200: auditPageSchema,
          400: problemSchema,
          401: problemSchema,
          403: problemSchema,
        },
      },
    },
    async (request) => {
      const office = currentOffice(request)
      if (office.role !== "owner") {
        throw Object.assign(new Error("Only the office owner can read the audit log."), {
          statusCode: 403,
        })
      }
      const { action, from, to, cursor, limit } = request.query
      const after = cursor === undefined ? undefined : decodeCursor(cursor)
      const rows = await withOffice(db, office.id, (tx) =>
        tx
          .select()
          .from(auditEvents)
          .where(
            and(
              action === undefined ? undefined : eq(auditEvents.action, action),
              from === undefined ? undefined : gte(auditEvents.occurredAt, new Date(from)),
              to === undefined ? undefined : lt(auditEvents.occurredAt, new Date(to)),
              after === undefined
                ? undefined
                : sql`(${auditEvents.occurredAt}, ${auditEvents.id}) < (${after.at.toISOString()}::timestamptz, ${after.id}::uuid)`,
            ),
          )
          .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
          .limit(limit + 1),
      )
      const page = rows.slice(0, limit)
      const last = page.at(-1)
      return {
        items: page.map((e) => ({
          id: e.id,
          occurredAt: e.occurredAt.toISOString(),
          action: e.action,
          actor:
            e.actorUserId === null
              ? null
              : { userId: e.actorUserId, role: actorRole.parse(e.actorRole) },
          resource: { type: e.resourceType, id: e.resourceId },
          requestId: e.requestId,
          metadata: e.metadata,
        })),
        nextCursor:
          rows.length > limit && last !== undefined ? encodeCursor(last.occurredAt, last.id) : null,
      }
    },
  )
  return Promise.resolve()
}

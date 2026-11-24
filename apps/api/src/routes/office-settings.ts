import { eq } from "drizzle-orm"
import type { FastifyReply, FastifyRequest } from "fastify"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod"
import { recordAudit } from "../audit/events.js"
import { auditContext } from "../audit/request.js"
import { currentOffice } from "../auth/plugin.js"
import { OFFICE_ROLES } from "../auth/roles.js"
import { cnpjSchema } from "../clients/cnpj.js"
import { type Db, type OfficeTx, withOffice } from "../db/client.js"
import { authOrganizations, officeLogos, offices } from "../db/schema.js"
import { brandColorSchema, brandContrast, brandContrastSchema } from "../office/brand-color.js"
import { LOGO_MAX_BYTES, LOGO_TYPES, validateLogo } from "../office/logo.js"
import { problemSchema } from "../problem.js"

export interface OfficeSettingsOptions {
  db: Db
}

export const officeSettingsSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: z.enum(OFFICE_ROLES),
  cnpj: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  brandColor: z.string().nullable(),
  /** Null without a brand colour. */
  brandContrast: brandContrastSchema.nullable(),
  logo: z
    .object({
      url: z.string(),
      contentType: z.enum(LOGO_TYPES),
      width: z.number().int(),
      height: z.number().int(),
      etag: z.string(),
      updatedAt: z.iso.datetime(),
    })
    .nullable(),
  updatedAt: z.iso.datetime(),
})

export const updateOfficeSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(200).optional(),
    cnpj: cnpjSchema.nullable().optional(),
    contactEmail: z.email().max(254).nullable().optional(),
    contactPhone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ().-]{8,20}$/, "Invalid phone number")
      .nullable()
      .optional(),
    brandColor: brandColorSchema.nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "Send at least one field")

const SETTINGS_FIELDS = ["name", "cnpj", "contactEmail", "contactPhone", "brandColor"] as const
export const LOGO_PATH = "/v1/office/logo"

const httpError = (status: number, message: string) =>
  Object.assign(new Error(message), { statusCode: status })

/** 403 unless the signed-in member is an owner of the office. */
export function requireOwner(request: FastifyRequest): void {
  if (currentOffice(request).role !== "owner") {
    throw httpError(403, "Only an owner of the office can do this.")
  }
}

const etagOf = (sha256: string) => `"${sha256}"`
const authErrors = { 400: problemSchema, 401: problemSchema, 403: problemSchema }

async function readSettings(tx: OfficeTx, request: FastifyRequest) {
  const office = currentOffice(request)
  const [row] = await tx.select().from(offices).where(eq(offices.id, office.id))
  if (row === undefined) throw httpError(403, "No access to this office.")
  const [logo] = await tx
    .select({
      contentType: officeLogos.contentType,
      width: officeLogos.width,
      height: officeLogos.height,
      sha256: officeLogos.sha256,
      updatedAt: officeLogos.updatedAt,
    })
    .from(officeLogos)
    .where(eq(officeLogos.officeId, office.id))
  return {
    id: row.id,
    name: row.name,
    role: office.role,
    cnpj: row.cnpj,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    brandColor: row.brandColor,
    brandContrast: row.brandColor === null ? null : brandContrast(row.brandColor),
    logo:
      logo === undefined
        ? null
        : {
            url: LOGO_PATH,
            contentType: z.enum(LOGO_TYPES).parse(logo.contentType),
            width: logo.width,
            height: logo.height,
            etag: etagOf(logo.sha256),
            updatedAt: logo.updatedAt.toISOString(),
          },
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * Office profile used in reports and the share view (BE-02.1, RF-01, RF-08): name, CNPJ, contact,
 * brand colour and logo. Any member reads it; only owners change it. Every change is audited with
 * the names of the fields changed, never their values.
 */
export const officeSettingsRoutes: FastifyPluginAsyncZod<OfficeSettingsOptions> = (app, { db }) => {
  const preHandler = app.requireOffice

  // Raw image bodies for the logo upload, only in this plugin. SVG has no parser: 415.
  app.addContentTypeParser(
    [...LOGO_TYPES],
    { parseAs: "buffer", bodyLimit: LOGO_MAX_BYTES },
    (_request, body, done) => {
      done(null, body)
    },
  )

  app.get(
    "/v1/office",
    {
      preHandler,
      schema: {
        tags: ["office"],
        summary: "Settings of the active office",
        response: { 200: officeSettingsSchema, ...authErrors },
      },
    },
    (request) => withOffice(db, currentOffice(request).id, (tx) => readSettings(tx, request)),
  )

  app.patch(
    "/v1/office",
    {
      preHandler,
      schema: {
        tags: ["office"],
        summary: "Change the office settings (owner only)",
        body: updateOfficeSchema,
        response: { 200: officeSettingsSchema, ...authErrors },
      },
    },
    async (request) => {
      requireOwner(request)
      const { name, ...profile } = request.body
      const fields = SETTINGS_FIELDS.filter((f) => request.body[f] !== undefined)
      const officeId = currentOffice(request).id
      return withOffice(db, officeId, async (tx) => {
        // The organization is the source of the name: its trigger renames the office (0003).
        if (name !== undefined) {
          await tx.update(authOrganizations).set({ name }).where(eq(authOrganizations.id, officeId))
        }
        await tx
          .update(offices)
          .set({ ...profile, updatedAt: new Date() })
          .where(eq(offices.id, officeId))
        await recordAudit(tx, {
          action: "office.updated",
          resourceId: officeId,
          metadata: { fields },
          ...auditContext(request),
        })
        return readSettings(tx, request)
      })
    },
  )

  app.get(
    LOGO_PATH,
    {
      preHandler,
      schema: {
        tags: ["office"],
        summary: "Logo of the active office (ETag, If-None-Match)",
        response: { ...authErrors, 404: problemSchema },
      },
    },
    async (request, reply) => {
      const officeId = currentOffice(request).id
      const [logo] = await withOffice(db, officeId, (tx) =>
        tx.select().from(officeLogos).where(eq(officeLogos.officeId, officeId)),
      )
      if (logo === undefined) throw httpError(404, "The office has no logo.")
      const etag = etagOf(logo.sha256)
      reply
        .header("etag", etag)
        .header("cache-control", "private, no-cache")
        .header("x-content-type-options", "nosniff")
        .header("content-security-policy", "default-src 'none'")
      // Binary body: outside the typed (JSON) responses of this route.
      const raw = reply as unknown as FastifyReply
      if (request.headers["if-none-match"] === etag) return raw.code(304).send()
      return raw.type(logo.contentType).send(logo.data)
    },
  )

  app.post(
    LOGO_PATH,
    {
      preHandler,
      schema: {
        tags: ["office"],
        summary: "Upload the office logo: PNG, JPEG or WebP body, at most 200 KB (owner only)",
        consumes: [...LOGO_TYPES],
        response: {
          200: officeSettingsSchema,
          ...authErrors,
          413: problemSchema,
          415: problemSchema,
          422: problemSchema,
        },
      },
    },
    async (request) => {
      requireOwner(request)
      const body: unknown = request.body
      if (!Buffer.isBuffer(body)) throw httpError(415, "Send the image as the request body.")
      const logo = validateLogo(body)
      if (request.headers["content-type"]?.split(";")[0]?.trim() !== logo.contentType) {
        throw httpError(415, "The content type does not match the image.")
      }
      const officeId = currentOffice(request).id
      return withOffice(db, officeId, async (tx) => {
        const values = { ...logo, data: body, updatedAt: new Date() }
        await tx
          .insert(officeLogos)
          .values({ officeId, ...values })
          .onConflictDoUpdate({ target: officeLogos.officeId, set: values })
        await recordAudit(tx, {
          action: "office.updated",
          resourceId: officeId,
          metadata: { fields: ["logo"] },
          ...auditContext(request),
        })
        return readSettings(tx, request)
      })
    },
  )

  app.delete(
    LOGO_PATH,
    {
      preHandler,
      schema: {
        tags: ["office"],
        summary: "Remove the office logo (owner only)",
        response: { 204: z.null(), ...authErrors, 404: problemSchema },
      },
    },
    async (request, reply) => {
      requireOwner(request)
      const officeId = currentOffice(request).id
      const deleted = await withOffice(db, officeId, async (tx) => {
        const rows = await tx
          .delete(officeLogos)
          .where(eq(officeLogos.officeId, officeId))
          .returning({ id: officeLogos.officeId })
        if (rows.length === 0) return false
        await recordAudit(tx, {
          action: "office.updated",
          resourceId: officeId,
          metadata: { fields: ["logo"] },
          ...auditContext(request),
        })
        return true
      })
      if (!deleted) throw httpError(404, "The office has no logo.")
      return reply.code(204).send(null)
    },
  )

  return Promise.resolve()
}

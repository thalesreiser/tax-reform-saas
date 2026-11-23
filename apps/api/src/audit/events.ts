import { sql } from "drizzle-orm"
import { z } from "zod"
import { OFFICE_ROLES } from "../auth/roles.js"
import type { OfficeTx } from "../db/client.js"
import {
  AUDIT_ACTIONS,
  type AuditAction,
  type AuditResourceType,
  auditEvents,
} from "../db/schema.js"

const role = z.enum(OFFICE_ROLES)
/** Office fields better-auth can update; only their names are logged, never their values. */
export const OFFICE_FIELDS = ["name", "slug", "logo", "metadata"] as const
/** Client fields (BE-02.2 extends this list as columns are added). */
export const CLIENT_FIELDS = ["cnpj", "legalName"] as const

/**
 * Allow-list of metadata per action. Only enums, ids and field names: no free text, so a name, an
 * e-mail, a CNPJ or a fiscal value can never be logged (tests/audit.test.ts enforces the shape).
 */
export const AUDIT_METADATA = {
  "office.created": z.strictObject({}),
  "office.updated": z.strictObject({ fields: z.array(z.enum(OFFICE_FIELDS)).min(1) }),
  "member.invited": z.strictObject({ role }),
  "member.invitation_canceled": z.strictObject({}),
  "member.invitation_rejected": z.strictObject({}),
  "member.joined": z.strictObject({ role, invitationId: z.uuid().optional() }),
  "member.role_changed": z.strictObject({ from: role, to: role }),
  "member.removed": z.strictObject({ role }),
  "member.left": z.strictObject({ role }),
  "client.created": z.strictObject({}),
  "client.updated": z.strictObject({ fields: z.array(z.enum(CLIENT_FIELDS)).min(1) }),
  "client.deleted": z.strictObject({}),
} satisfies Record<AuditAction, z.ZodType>

/** The kind of resource each action is about; `resourceId` is that resource's id. */
export const AUDIT_RESOURCE_OF = {
  "office.created": "office",
  "office.updated": "office",
  "member.invited": "invitation",
  "member.invitation_canceled": "invitation",
  "member.invitation_rejected": "invitation",
  "member.joined": "member",
  "member.role_changed": "member",
  "member.removed": "member",
  "member.left": "member",
  "client.created": "client",
  "client.updated": "client",
  "client.deleted": "client",
} as const satisfies Record<AuditAction, AuditResourceType>

const actorSchema = z.object({ userId: z.uuid(), role: role.nullable() }).nullable()

/** Who did it and in which request; `actor: null` for the system. */
export interface AuditContext {
  actor: z.input<typeof actorSchema>
  requestId: string | null
}

/** What happened, to which resource: one member per action, with that action's metadata. */
export type AuditRecord = {
  [A in AuditAction]: {
    action: A
    resourceId: string
    metadata: z.input<(typeof AUDIT_METADATA)[A]>
  }
}[AuditAction]

export type AuditEvent = AuditContext & AuditRecord

const eventSchema = z.object({
  action: z.enum(AUDIT_ACTIONS),
  resourceId: z.uuid(),
  requestId: z.uuid().nullable(),
  actor: actorSchema,
})

/** Validates the metadata of `action` against its allow-list; throws a ZodError otherwise. */
export function auditMetadata(action: AuditAction, metadata: unknown): Record<string, unknown> {
  return AUDIT_METADATA[action].parse(metadata)
}

/**
 * Writes one event in the transaction of the action it records, so both commit or roll back
 * together. The office is the one of the transaction (`withOffice`). Invalid events throw before
 * touching the database.
 */
export async function recordAudit(tx: OfficeTx, event: AuditEvent): Promise<void> {
  const { action, resourceId, requestId, actor } = eventSchema.parse(event)
  const metadata = auditMetadata(action, event.metadata)
  await tx.insert(auditEvents).values({
    officeId: sql`public.app_current_office_id()`,
    actorUserId: actor?.userId ?? null,
    actorRole: actor?.role ?? null,
    action,
    resourceType: AUDIT_RESOURCE_OF[action],
    resourceId,
    requestId,
    metadata,
  })
}

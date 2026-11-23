import { and, eq } from "drizzle-orm"
import { type OfficeRole, isOfficeRole } from "../auth/roles.js"
import { authMembers } from "../db/auth-schema.js"
import { type Db, authDatabase, withOffice } from "../db/client.js"
import { authRequestContext } from "./context.js"
import { OFFICE_FIELDS, type AuditRecord, recordAudit } from "./events.js"

interface Ref {
  id: string
}
interface MemberRef extends Ref {
  organizationId: string
  userId: string
  role: string
}
interface InvitationRef extends Ref {
  role: string
}

/** better-auth stores one role per member here (hooks in src/auth/auth.ts reject the rest). */
function officeRole(value: string): OfficeRole {
  if (!isOfficeRole(value)) throw new Error("Unexpected member role.")
  return value
}

/**
 * Audit events for better-auth's office, member and invitation actions (RF-18). better-auth runs
 * these after-hooks once its own write is done and outside any transaction, so the event is written
 * right after the action, in its own transaction: if that write fails, the request fails with a
 * 500 while the action stands (see README "Audit log").
 */
export function createAuditHooks(db: Db) {
  const database = authDatabase(db)

  async function roleIn(officeId: string, userId: string): Promise<OfficeRole | null> {
    const [row] = await database
      .select({ role: authMembers.role })
      .from(authMembers)
      .where(and(eq(authMembers.organizationId, officeId), eq(authMembers.userId, userId)))
      .limit(1)
    return row !== undefined && isOfficeRole(row.role) ? row.role : null
  }

  async function record(
    officeId: string,
    event: AuditRecord,
    actorUserId: string | null,
    actorRole?: OfficeRole | null,
  ): Promise<void> {
    const role =
      actorRole !== undefined || actorUserId === null
        ? (actorRole ?? null)
        : await roleIn(officeId, actorUserId)
    const requestId = authRequestContext.getStore()?.requestId ?? null
    await withOffice(db, officeId, (tx) =>
      recordAudit(tx, {
        ...event,
        actor: actorUserId === null ? null : { userId: actorUserId, role },
        requestId,
      }),
    )
  }

  /** The user who sent the request, for hooks whose payload names only the affected member. */
  const requester = () => authRequestContext.getStore()?.actorUserId ?? null

  const organizationHooks = {
    afterCreateOrganization: ({ organization, user }: { organization: Ref; user: Ref }) =>
      record(
        organization.id,
        { action: "office.created", resourceId: organization.id, metadata: {} },
        user.id,
        "owner",
      ),
    // better-auth passes only the updated row to the after-hook: keep the names of the fields sent.
    beforeUpdateOrganization: ({ organization }: { organization: object }) => {
      const store = authRequestContext.getStore()
      if (store !== undefined) {
        store.officeFields = OFFICE_FIELDS.filter((f) => Object.keys(organization).includes(f))
      }
      return Promise.resolve()
    },
    afterUpdateOrganization: async ({ user, member }: { user: Ref; member: MemberRef }) => {
      const fields = authRequestContext.getStore()?.officeFields ?? []
      if (fields.length === 0) return
      await record(
        member.organizationId,
        { action: "office.updated", resourceId: member.organizationId, metadata: { fields } },
        user.id,
        officeRole(member.role),
      )
    },
    afterCreateInvitation: (data: { invitation: InvitationRef; inviter: Ref; organization: Ref }) =>
      record(
        data.organization.id,
        {
          action: "member.invited",
          resourceId: data.invitation.id,
          metadata: { role: officeRole(data.invitation.role) },
        },
        data.inviter.id,
      ),
    afterCancelInvitation: (data: { invitation: Ref; cancelledBy: Ref; organization: Ref }) =>
      record(
        data.organization.id,
        { action: "member.invitation_canceled", resourceId: data.invitation.id, metadata: {} },
        data.cancelledBy.id,
      ),
    // The invitee is not a member: no role.
    afterRejectInvitation: (data: { invitation: Ref; user: Ref; organization: Ref }) =>
      record(
        data.organization.id,
        { action: "member.invitation_rejected", resourceId: data.invitation.id, metadata: {} },
        data.user.id,
        null,
      ),
    afterAcceptInvitation: (data: {
      invitation: Ref
      member: MemberRef
      user: Ref
      organization: Ref
    }) => {
      const role = officeRole(data.member.role)
      return record(
        data.organization.id,
        {
          action: "member.joined",
          resourceId: data.member.id,
          metadata: { role, invitationId: data.invitation.id },
        },
        data.user.id,
        role,
      )
    },
    afterUpdateMemberRole: (data: { member: MemberRef; previousRole: string; organization: Ref }) =>
      record(
        data.organization.id,
        {
          action: "member.role_changed",
          resourceId: data.member.id,
          metadata: { from: officeRole(data.previousRole), to: officeRole(data.member.role) },
        },
        requester(),
      ),
    afterRemoveMember: ({ member, organization }: { member: MemberRef; organization: Ref }) => {
      const actor = requester()
      const role = officeRole(member.role)
      return record(
        organization.id,
        { action: "member.removed", resourceId: member.id, metadata: { role } },
        actor,
        actor === member.userId ? role : undefined,
      )
    },
  }

  /** `organization/leave` has no better-auth hook: plugin.ts calls this after it succeeds. */
  const memberLeft = (member: MemberRef) => {
    const role = officeRole(member.role)
    return record(
      member.organizationId,
      { action: "member.left", resourceId: member.id, metadata: { role } },
      member.userId,
      role,
    )
  }

  return { organizationHooks, memberLeft }
}

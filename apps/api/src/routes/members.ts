import { and, asc, eq, gt } from "drizzle-orm"
import type { FastifyRequest } from "fastify"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod"
import { authRequestContext } from "../audit/context.js"
import { recordAudit } from "../audit/events.js"
import { auditContext } from "../audit/request.js"
import type { Auth } from "../auth/auth.js"
import { currentOffice, toHeaders } from "../auth/plugin.js"
import { OFFICE_ROLES, isOfficeRole } from "../auth/roles.js"
import { type Db, authDatabase, withOffice } from "../db/client.js"
import { authInvitations, authMembers, authSessions, authUsers } from "../db/schema.js"
import { type MemberChange, leavesNoOwner } from "../office/members.js"
import { problemSchema } from "../problem.js"
import { requireOwner } from "./office-settings.js"

export interface MemberRoutesOptions {
  db: Db
  auth: Auth
}

export const memberSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: z.enum(OFFICE_ROLES),
  joinedAt: z.iso.datetime(),
})

export const invitationSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  role: z.enum(OFFICE_ROLES),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
})

const idParams = z.object({ id: z.uuid() })
const errors = {
  400: problemSchema,
  401: problemSchema,
  403: problemSchema,
  404: problemSchema,
  409: problemSchema,
}

const httpError = (status: number, message: string) =>
  Object.assign(new Error(message), { statusCode: status })

/**
 * Members and pending invitations of the active office (BE-02.1, RF-01). Changes go through
 * better-auth's organization API, whose hooks write the audit events (src/audit/auth-hooks.ts);
 * resending an invitation has no hook and is audited here. Any member lists members; only owners
 * change roles, remove members and manage invitations. Ids from another office answer 404.
 */
export const memberRoutes: FastifyPluginAsyncZod<MemberRoutesOptions> = (app, { db, auth }) => {
  const database = authDatabase(db)
  const preHandler = app.requireOffice

  // Names and e-mails are personal data: the request log shows the route pattern, never the URL.
  app.addHook("onRoute", (route) => {
    route.logSerializers = {
      ...route.logSerializers,
      req: (req: FastifyRequest) => `${req.method} ${route.url}`,
    }
  })

  /** Runs a better-auth call as the signed-in user, with the context its audit hooks read. */
  function asUser<T>(request: FastifyRequest, call: (headers: Headers) => Promise<T>): Promise<T> {
    return authRequestContext.run(
      { requestId: request.id, actorUserId: currentOffice(request).userId },
      () => call(toHeaders(request)),
    )
  }

  function roles(officeId: string) {
    return database
      .select({ id: authMembers.id, role: authMembers.role, userId: authMembers.userId })
      .from(authMembers)
      .where(eq(authMembers.organizationId, officeId))
  }

  async function checkChange(officeId: string, memberId: string, change: MemberChange) {
    const members = await roles(officeId)
    const target = members.find((m) => m.id === memberId)
    if (target === undefined) throw httpError(404, "Member not found.")
    if (leavesNoOwner(members, memberId, change)) {
      throw httpError(409, "The office must keep at least one owner.")
    }
    return target
  }

  async function pendingInvitation(officeId: string, id: string) {
    const [row] = await database
      .select()
      .from(authInvitations)
      .where(
        and(
          eq(authInvitations.id, id),
          eq(authInvitations.organizationId, officeId),
          eq(authInvitations.status, "pending"),
        ),
      )
    if (row === undefined) throw httpError(404, "Invitation not found.")
    return row
  }

  app.get(
    "/v1/office/members",
    {
      preHandler,
      schema: {
        tags: ["office"],
        summary: "Members of the active office",
        response: { 200: z.object({ items: z.array(memberSchema) }), ...errors },
      },
    },
    async (request) => {
      const rows = await database
        .select({
          id: authMembers.id,
          userId: authMembers.userId,
          name: authUsers.name,
          email: authUsers.email,
          role: authMembers.role,
          joinedAt: authMembers.createdAt,
        })
        .from(authMembers)
        .innerJoin(authUsers, eq(authUsers.id, authMembers.userId))
        .where(eq(authMembers.organizationId, currentOffice(request).id))
        .orderBy(asc(authMembers.createdAt), asc(authMembers.id))
      const items = rows.flatMap((r) =>
        isOfficeRole(r.role) ? [{ ...r, role: r.role, joinedAt: r.joinedAt.toISOString() }] : [],
      )
      return { items }
    },
  )

  app.patch(
    "/v1/office/members/:id",
    {
      preHandler,
      schema: {
        tags: ["office"],
        summary: "Change a member's role (owner only; the last owner cannot be demoted)",
        params: idParams,
        body: z.strictObject({ role: z.enum(OFFICE_ROLES) }),
        response: { 204: z.null(), ...errors },
      },
    },
    async (request, reply) => {
      requireOwner(request)
      const officeId = currentOffice(request).id
      const { id } = request.params
      const { role } = request.body
      const target = await checkChange(officeId, id, { kind: "role", to: role })
      if (target.role !== role) {
        await asUser(request, (headers) =>
          auth.api.updateMemberRole({
            headers,
            body: { memberId: id, role, organizationId: officeId },
          }),
        )
      }
      return reply.code(204).send(null)
    },
  )

  app.delete(
    "/v1/office/members/:id",
    {
      preHandler,
      schema: {
        tags: ["office"],
        summary: "Remove a member; access ends on their next request (owner only)",
        params: idParams,
        response: { 204: z.null(), ...errors },
      },
    },
    async (request, reply) => {
      requireOwner(request)
      const officeId = currentOffice(request).id
      const { id } = request.params
      const target = await checkChange(officeId, id, { kind: "remove" })
      await asUser(request, (headers) =>
        auth.api.removeMember({
          headers,
          body: { memberIdOrEmail: id, organizationId: officeId },
        }),
      )
      // requireOffice re-reads the membership on every request, so access already ends here;
      // sessions parked on this office also lose it as their active office.
      await database
        .update(authSessions)
        .set({ activeOrganizationId: null })
        .where(
          and(
            eq(authSessions.userId, target.userId),
            eq(authSessions.activeOrganizationId, officeId),
          ),
        )
      return reply.code(204).send(null)
    },
  )

  app.get(
    "/v1/office/invitations",
    {
      preHandler,
      schema: {
        tags: ["office"],
        summary: "Pending invitations of the active office (owner only)",
        response: { 200: z.object({ items: z.array(invitationSchema) }), ...errors },
      },
    },
    async (request) => {
      requireOwner(request)
      const rows = await database
        .select()
        .from(authInvitations)
        .where(
          and(
            eq(authInvitations.organizationId, currentOffice(request).id),
            eq(authInvitations.status, "pending"),
            gt(authInvitations.expiresAt, new Date()),
          ),
        )
        .orderBy(asc(authInvitations.createdAt), asc(authInvitations.id))
      const items = rows.flatMap((r) =>
        isOfficeRole(r.role)
          ? [
              {
                id: r.id,
                email: r.email,
                role: r.role,
                expiresAt: r.expiresAt.toISOString(),
                createdAt: r.createdAt.toISOString(),
              },
            ]
          : [],
      )
      return { items }
    },
  )

  app.delete(
    "/v1/office/invitations/:id",
    {
      preHandler,
      schema: {
        tags: ["office"],
        summary: "Cancel a pending invitation (owner only)",
        params: idParams,
        response: { 204: z.null(), ...errors },
      },
    },
    async (request, reply) => {
      requireOwner(request)
      const { id } = request.params
      await pendingInvitation(currentOffice(request).id, id)
      await asUser(request, (headers) =>
        auth.api.cancelInvitation({ headers, body: { invitationId: id } }),
      )
      return reply.code(204).send(null)
    },
  )

  app.post(
    "/v1/office/invitations/:id/resend",
    {
      preHandler,
      schema: {
        tags: ["office"],
        summary: "Resend a pending invitation and extend it by 48 hours (owner only)",
        params: idParams,
        response: { 204: z.null(), ...errors },
      },
    },
    async (request, reply) => {
      requireOwner(request)
      const officeId = currentOffice(request).id
      const { id } = request.params
      const invitation = await pendingInvitation(officeId, id)
      const role = invitation.role
      if (!isOfficeRole(role)) throw httpError(409, "The invitation has an unknown role.")
      await asUser(request, (headers) =>
        auth.api.createInvitation({
          headers,
          body: { email: invitation.email, role, organizationId: officeId, resend: true },
        }),
      )
      await withOffice(db, officeId, (tx) =>
        recordAudit(tx, {
          action: "member.invitation_resent",
          resourceId: id,
          metadata: {},
          ...auditContext(request),
        }),
      )
      return reply.code(204).send(null)
    },
  )

  return Promise.resolve()
}

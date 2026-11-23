import type { FastifyRequest } from "fastify"
import { currentOffice } from "../auth/plugin.js"
import type { AuditContext } from "./events.js"

/** Actor and request id of a route behind `app.requireOffice`, for `recordAudit()`. */
export function auditContext(request: FastifyRequest): AuditContext {
  const office = currentOffice(request)
  return { actor: { userId: office.userId, role: office.role }, requestId: request.id }
}

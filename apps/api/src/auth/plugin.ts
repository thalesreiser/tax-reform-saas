import { and, eq } from "drizzle-orm"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { z } from "zod"
import { createAuditHooks } from "../audit/auth-hooks.js"
import { authRequestContext } from "../audit/context.js"
import { authMembers } from "../db/auth-schema.js"
import { type Db, authDatabase } from "../db/client.js"
import { problem, sendProblem } from "../problem.js"
import { AUTH_BASE_PATH, type Auth } from "./auth.js"
import { type OfficeRole, isOfficeRole } from "./roles.js"

/** The office of the request, resolved from the session by `app.requireOffice`. */
export interface OfficeContext {
  id: string
  role: OfficeRole
  userId: string
}

declare module "fastify" {
  interface FastifyInstance {
    /** preHandler: 401 without a session, 403 without an active office the user belongs to. */
    requireOffice: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<FastifyReply | undefined>
  }
  interface FastifyRequest {
    office: OfficeContext | null
  }
}

export interface AuthRoutesOptions {
  auth: Auth
  db: Db
  /** Public URL of the API; requests are rebuilt on it, never on the client's Host header. */
  baseUrl: string
}

const WINDOW_MS = 15 * 60 * 1000
/** Sign-in and sign-up attempts per IP and per e-mail in 15 minutes. */
export const CREDENTIAL_LIMITS = { perIp: 30, perEmail: 5 } as const
/** Endpoints that take a password or send an e-mail to the address in the body. */
const CREDENTIAL_PATHS = new Set(["/sign-in/email", "/sign-up/email", "/send-verification-email"])
/** Body and query fields that better-auth passes to uuid columns: malformed ids are a 400. */
const ID_FIELDS = ["id", "invitationId", "organizationId", "memberId", "userId"]
/** Actions whose better-auth hooks do not say who acted: the session is read before them. */
const ACTOR_PATHS = new Set(["/organization/remove-member", "/organization/update-member-role"])
/** `organization/leave` has no better-auth hook; it answers with the member who left. */
const LEAVE_PATH = "/organization/leave"
const leftMemberSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  userId: z.uuid(),
  role: z.string(),
})

const uuid = z.uuid()

function authPath(request: FastifyRequest): string {
  return (request.url.split("?")[0] ?? "").slice(AUTH_BASE_PATH.length)
}

function field(source: unknown, name: string): unknown {
  return typeof source === "object" && source !== null && name in source
    ? (source as Record<string, unknown>)[name]
    : undefined
}

function emailOf(request: FastifyRequest): string | undefined {
  const email = field(request.body, "email")
  return typeof email === "string" ? email.trim().toLowerCase() : undefined
}

/** Hop-by-hop or body-framing headers: the body is re-serialised, so its length may differ. */
const DROPPED_HEADERS = new Set(["connection", "content-length", "transfer-encoding"])

function toHeaders(request: FastifyRequest): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || DROPPED_HEADERS.has(name)) continue
    for (const v of Array.isArray(value) ? value : [value]) headers.append(name, v)
  }
  return headers
}

function activeOfficeId(session: object): string | undefined {
  const id = "activeOrganizationId" in session ? session.activeOrganizationId : undefined
  return typeof id === "string" && id !== "" ? id : undefined
}

/**
 * Mounts better-auth at /api/auth/* (Fastify <-> Web Request/Response) with rate limits, and
 * decorates the app with `requireOffice`, the bridge from the session to `withOffice()`. Call it on
 * the root instance after registering @fastify/rate-limit.
 */
export function registerAuth(app: FastifyInstance, { auth, db, baseUrl }: AuthRoutesOptions): void {
  const database = authDatabase(db)
  const audit = createAuditHooks(db)
  const perIp = app.createRateLimit({
    max: CREDENTIAL_LIMITS.perIp,
    timeWindow: WINDOW_MS,
    keyGenerator: (request) => `credentials:ip:${request.ip}`,
  })
  const perEmail = app.createRateLimit({
    max: CREDENTIAL_LIMITS.perEmail,
    timeWindow: WINDOW_MS,
    keyGenerator: (request) => `credentials:email:${emailOf(request) ?? ""}`,
    allowList: (request) => emailOf(request) === undefined,
  })

  app.decorateRequest("office", null)

  app.route({
    method: ["GET", "POST"],
    url: `${AUTH_BASE_PATH}/*`,
    // Every auth endpoint, per IP; the credential endpoints have stricter limits below.
    config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    schema: { hide: true },
    handler: async (request, reply) => {
      if (request.method === "POST" && CREDENTIAL_PATHS.has(authPath(request))) {
        for (const check of [perIp, perEmail]) {
          const result = await check(request)
          // `isAllowed` is false for every counted request; `isExceeded` means over the limit.
          if (!result.isAllowed && result.isExceeded) {
            reply.header("retry-after", String(result.ttlInSeconds))
            return sendProblem(
              reply,
              problem(request, 429, { detail: "Too many attempts. Try again later." }),
            )
          }
        }
      }

      const query = Object.fromEntries(new URL(request.url, baseUrl).searchParams)
      const badId = ID_FIELDS.find((name) =>
        [field(request.body, name), query[name]].some(
          (v) => typeof v === "string" && !uuid.safeParse(v).success,
        ),
      )
      if (badId !== undefined) {
        return sendProblem(reply, problem(request, 400, { detail: `Invalid ${badId}.` }))
      }

      const path = authPath(request)
      const actor =
        request.method === "POST" && ACTOR_PATHS.has(path)
          ? await auth.api.getSession({ headers: toHeaders(request) })
          : null
      // Read by the audit hooks (src/audit/auth-hooks.ts): request id and, where needed, the actor.
      const response = await authRequestContext.run(
        { requestId: request.id, actorUserId: actor?.user.id ?? null },
        () =>
          auth.handler(
            new Request(new URL(request.url, baseUrl), {
              method: request.method,
              headers: toHeaders(request),
              ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
            }),
          ),
      )

      reply.code(response.status)
      response.headers.forEach((value, name) => {
        if (name !== "set-cookie" && name !== "content-length") reply.header(name, value)
      })
      const cookies = response.headers.getSetCookie()
      if (cookies.length > 0) reply.header("set-cookie", cookies)

      const text = await response.text()
      if (response.status < 400 && path === LEAVE_PATH) {
        const left = leftMemberSchema.parse(JSON.parse(text))
        await authRequestContext.run({ requestId: request.id, actorUserId: left.userId }, () =>
          audit.memberLeft(left),
        )
      }
      if (response.status < 400) return reply.send(text === "" ? null : text)

      // Errors become problem details, like every other route; 5xx causes stay out of the body.
      let body: unknown
      try {
        body = JSON.parse(text)
      } catch {
        body = undefined
      }
      const message = field(body, "message")
      const code = field(body, "code")
      return sendProblem(
        reply,
        problem(request, response.status, {
          ...(response.status < 500 && typeof message === "string" ? { detail: message } : {}),
          ...(typeof code === "string" ? { code } : {}),
        }),
      )
    },
  })

  app.decorate("requireOffice", async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await auth.api.getSession({ headers: toHeaders(request) })
    if (session === null) {
      return sendProblem(reply, problem(request, 401, { detail: "Sign in to continue." }))
    }
    const officeId = activeOfficeId(session.session)
    const [member] =
      officeId === undefined
        ? []
        : await database
            .select({ role: authMembers.role })
            .from(authMembers)
            .where(
              and(
                eq(authMembers.organizationId, officeId),
                eq(authMembers.userId, session.user.id),
              ),
            )
            .limit(1)
    if (officeId === undefined || member === undefined || !isOfficeRole(member.role)) {
      return sendProblem(reply, problem(request, 403, { detail: "No access to this office." }))
    }
    request.office = { id: officeId, role: member.role, userId: session.user.id }
    return undefined
  })
}

/** The office resolved by `app.requireOffice`; call `withOffice(db, currentOffice(request).id, …)`. */
export function currentOffice(request: FastifyRequest): OfficeContext {
  if (request.office === null) throw new Error("Route is missing the requireOffice preHandler.")
  return request.office
}

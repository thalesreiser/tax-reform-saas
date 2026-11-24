import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError } from "better-auth/api"
import { organization } from "better-auth/plugins/organization"
import { asc, eq } from "drizzle-orm"
import type { FastifyBaseLogger } from "fastify"
import { createAuditHooks } from "../audit/auth-hooks.js"
import type { Config } from "../config.js"
import { authSchema, authMembers } from "../db/auth-schema.js"
import { type Db, authDatabase } from "../db/client.js"
import { type OriginPolicy, isAllowedOrigin } from "../origins.js"
import { type Mailer, invitationMail, resetPasswordMail, verificationMail } from "./mailer.js"
import { accessControl, isOfficeRole, officeRoles } from "./roles.js"

/** Mount point of better-auth's routes in the Fastify app. */
export const AUTH_BASE_PATH = "/api/auth"
export const MIN_PASSWORD_LENGTH = 10
export const MAX_PASSWORD_LENGTH = 128
/** Invitation lifetime: 48 hours. */
export const INVITATION_EXPIRES_IN_SECONDS = 48 * 60 * 60
/** Password-reset link lifetime: 1 hour. */
export const RESET_PASSWORD_EXPIRES_IN_SECONDS = 60 * 60

export interface AuthDeps {
  config: Config
  db: Db
  mailer: Mailer
  log: FastifyBaseLogger
  /** Browser origins trusted by the origin check (src/origins.ts); the API's own is always trusted. */
  origins: OriginPolicy
}

function rejectUnknownRole(role: unknown): void {
  const roles = typeof role === "string" ? role.split(",").map((r) => r.trim()) : [role]
  if (roles.length !== 1 || !isOfficeRole(roles[0])) {
    throw new APIError("BAD_REQUEST", { message: "Role must be owner or accountant." })
  }
}

/**
 * better-auth with e-mail + password and the organization plugin (organization = office, RF-01).
 * Its own rate limiter is off: the Fastify plugin limits per IP and per e-mail (src/auth/plugin.ts).
 */
export function createAuth({ config, db, mailer, log, origins }: AuthDeps) {
  const database = authDatabase(db)
  const webUrl = config.WEB_URL ?? config.BETTER_AUTH_URL
  const audit = createAuditHooks(db).organizationHooks

  return betterAuth({
    appName: "Reforma Tributária",
    baseURL: config.BETTER_AUTH_URL,
    basePath: AUTH_BASE_PATH,
    secret: config.BETTER_AUTH_SECRET,
    // Exact origins, plus the request's own origin only when it matches a wildcard pattern of ours
    // (better-auth's own wildcards are looser than src/origins.ts).
    trustedOrigins: (request) => {
      const origin = request?.headers.get("origin") ?? undefined
      const matched = origin !== undefined && isAllowedOrigin(origin, origins) ? [origin] : []
      return [...origins.exact, ...matched]
    },
    database: drizzleAdapter(database, { provider: "pg", schema: authSchema, transaction: true }),
    telemetry: { enabled: false },
    rateLimit: { enabled: false },
    // Only the message: better-auth's extra arguments can carry e-mails or tokens.
    logger: {
      level: "warn",
      log: (level, message) => log[level](message),
    },
    advanced: {
      database: { generateId: "uuid" },
      cookiePrefix: "trs",
      useSecureCookies: config.NODE_ENV === "production",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      requireEmailVerification: true,
      // Sign-up answers the same way whether or not the e-mail is taken (no user enumeration).
      autoSignIn: false,
      resetPasswordTokenExpiresIn: RESET_PASSWORD_EXPIRES_IN_SECONDS,
      // A reset signs out every other device (a stolen session does not survive it).
      revokeSessionsOnPasswordReset: true,
      // The link goes straight to the web page, which posts the token to /reset-password.
      // The answer is the same whether the e-mail exists or not (better-auth).
      sendResetPassword: ({ user, token }) =>
        mailer.send(
          resetPasswordMail({
            to: user.email,
            url: `${webUrl}/redefinir-senha?token=${encodeURIComponent(token)}`,
          }),
        ),
    },
    emailVerification: {
      sendOnSignUp: true,
      expiresIn: 24 * 60 * 60,
      sendVerificationEmail: ({ user, url }) =>
        mailer.send(verificationMail({ to: user.email, url })),
    },
    databaseHooks: {
      session: {
        create: {
          // A new session starts in the user's oldest office, if any.
          before: async (session) => {
            const [first] = await database
              .select({ organizationId: authMembers.organizationId })
              .from(authMembers)
              .where(eq(authMembers.userId, session.userId))
              .orderBy(asc(authMembers.createdAt))
              .limit(1)
            return { data: { ...session, activeOrganizationId: first?.organizationId ?? null } }
          },
        },
      },
    },
    plugins: [
      organization({
        ac: accessControl,
        roles: officeRoles,
        creatorRole: "owner",
        invitationExpiresIn: INVITATION_EXPIRES_IN_SECONDS,
        cancelPendingInvitationsOnReInvite: true,
        requireEmailVerificationOnInvitation: true,
        // Offices are never deleted through the API (their FK would block it anyway).
        disableOrganizationDeletion: true,
        sendInvitationEmail: ({ id, email, role, organization: office }) =>
          mailer.send(
            invitationMail({
              to: email,
              officeName: office.name,
              role,
              url: `${webUrl}/convites/${encodeURIComponent(id)}`,
            }),
          ),
        organizationHooks: {
          // Audit log (RF-18): office, member and invitation actions.
          ...audit,
          // better-auth also accepts its default roles (admin, member): only ours are assignable.
          beforeCreateInvitation: ({ invitation }) => {
            rejectUnknownRole(invitation.role)
            return Promise.resolve()
          },
          beforeAddMember: ({ member }) => {
            rejectUnknownRole(member.role)
            return Promise.resolve()
          },
          beforeUpdateMemberRole: ({ newRole }) => {
            rejectUnknownRole(newRole)
            return Promise.resolve()
          },
        },
      }),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>

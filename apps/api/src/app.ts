import { randomUUID } from "node:crypto"
import fastifyRateLimit from "@fastify/rate-limit"
import fastifySwagger from "@fastify/swagger"
import Fastify from "fastify"
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod"
import { createAuth } from "./auth/auth.js"
import { LogMailer, type Mailer } from "./auth/mailer.js"
import { registerAuth } from "./auth/plugin.js"
import type { Config } from "./config.js"
import { createDb } from "./db/client.js"
import { errorHandler, problem, sendProblem } from "./problem.js"
import { auditRoutes } from "./routes/audit.js"
import { healthRoutes } from "./routes/health.js"
import { officeRoutes } from "./routes/office.js"

export const REQUEST_ID_HEADER = "x-request-id"

/** Paths whose values must never reach the logs: credentials and API keys. */
const REDACTED = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
]

export interface AppDeps {
  /** E-mail transport; defaults to the log transport (no provider yet). */
  mailer?: Mailer
}

/**
 * Builds the API without listening, so tests use `app.inject()`. Routes added before
 * `app.ready()` are part of the OpenAPI document. The database pool connects on the first query.
 */
export async function buildApp(config: Config, deps: AppDeps = {}) {
  const base = Fastify({
    logger: { level: config.LOG_LEVEL, redact: { paths: REDACTED, censor: "[redacted]" } },
    // The id is always generated here: a client-supplied id is not trusted and never echoed.
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    // request.ip is the rate-limit key: only the configured proxy hops are trusted (none by default).
    trustProxy: config.TRUST_PROXY_HOPS > 0 ? config.TRUST_PROXY_HOPS : false,
  })

  base.setValidatorCompiler(validatorCompiler)
  base.setSerializerCompiler(serializerCompiler)
  base.setErrorHandler(errorHandler)
  base.setNotFoundHandler((request, reply) =>
    sendProblem(reply, problem(request, 404, { detail: "Route not found." })),
  )
  base.addHook("onRequest", (request, reply, done) => {
    reply.header(REQUEST_ID_HEADER, request.id)
    done()
  })

  const db = createDb(config.DATABASE_URL)
  base.addHook("onClose", () => db.close())

  // In memory, per instance: fine for one API process; a shared store comes with scaling.
  await base.register(fastifyRateLimit, { global: false })
  const mailer = deps.mailer ?? new LogMailer(base.log, config.NODE_ENV === "production")
  const auth = createAuth({ config, db, mailer, log: base.log })
  registerAuth(base, { auth, db, baseUrl: config.BETTER_AUTH_URL })

  const app = base.withTypeProvider<ZodTypeProvider>()

  await app.register(fastifySwagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Tax reform API",
        description: "CBS, IBS and IS calculation for accounting offices and their clients.",
        version: config.APP_VERSION,
      },
      tags: [
        { name: "system", description: "Health and metadata" },
        { name: "office", description: "The signed-in user's office" },
      ],
    },
    transform: jsonSchemaTransform,
  })

  await app.register(healthRoutes, { version: config.APP_VERSION })
  await app.register(officeRoutes, { db })
  await app.register(auditRoutes, { db })

  app.get("/openapi.json", { schema: { hide: true } }, () => app.swagger())

  return app
}

export type App = Awaited<ReturnType<typeof buildApp>>

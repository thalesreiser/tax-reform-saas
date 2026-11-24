import { randomUUID } from "node:crypto"
import fastifyCors from "@fastify/cors"
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
import { CnpjLookup, brasilApiProvider } from "./clients/lookup.js"
import { createDb } from "./db/client.js"
import { configOriginPolicy, isAllowedOrigin } from "./origins.js"
import { errorHandler, problem, sendProblem } from "./problem.js"
import { auditRoutes } from "./routes/audit.js"
import { clientRoutes } from "./routes/clients.js"
import { healthRoutes } from "./routes/health.js"
import { memberRoutes } from "./routes/members.js"
import { officeRoutes } from "./routes/office.js"
import { officeSettingsRoutes } from "./routes/office-settings.js"
import { referenceRoutes } from "./routes/reference.js"

export const REQUEST_ID_HEADER = "x-request-id"

/** Paths whose values must never reach the logs: credentials and API keys. */
const REDACTED = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
]

/**
 * Request log line: the route pattern (e.g. `/v1/clients/:id`) instead of the URL, so ids and query
 * strings (which may carry fiscal data) never reach the logs. No headers or body.
 */
export function serializeRequest(request: {
  method?: string
  routeOptions?: { url?: string | undefined }
}) {
  return {
    method: request.method,
    route: request.routeOptions?.url ?? "unmatched",
  }
}

export interface AppDeps {
  /** E-mail transport; defaults to the log transport (no provider yet). */
  mailer?: Mailer
  /** CNPJ lookup; defaults to BrasilAPI (tests pass a fake). */
  cnpjLookup?: CnpjLookup
}

/**
 * Builds the API without listening, so tests use `app.inject()`. Routes added before
 * `app.ready()` are part of the OpenAPI document. The database pool connects on the first query.
 */
export async function buildApp(config: Config, deps: AppDeps = {}) {
  const base = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: { paths: REDACTED, censor: "[redacted]" },
      serializers: { req: serializeRequest },
    },
    // The id is always generated here: a client-supplied id is not trusted and never echoed.
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    // request.ip is the rate-limit key: only the configured proxy hops are trusted (none by default).
    trustProxy: (_address: string, hop: number) => hop < config.TRUST_PROXY_HOPS,
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

  // CORS for the web app only: any other origin gets no CORS headers (and its preflight a 404).
  const origins = configOriginPolicy(config)
  await base.register(fastifyCors, {
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin, origins))
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["content-type"],
    exposedHeaders: ["retry-after", REQUEST_ID_HEADER],
    maxAge: 600,
  })

  const db = createDb(config.DATABASE_URL)
  base.addHook("onClose", () => db.close())

  // In memory, per instance: fine for one API process; a shared store comes with scaling.
  await base.register(fastifyRateLimit, { global: false })
  const mailer = deps.mailer ?? new LogMailer(base.log, config.NODE_ENV === "production")
  const auth = createAuth({ config, db, mailer, log: base.log, origins })
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
        { name: "office", description: "The signed-in user's office: settings, logo, members" },
        { name: "reference", description: "Reference data of the official engines (cached)" },
        { name: "clients", description: "Client companies of the office and CNPJ lookup" },
      ],
    },
    transform: jsonSchemaTransform,
  })

  await app.register(healthRoutes, { version: config.APP_VERSION })
  await app.register(officeRoutes, { db })
  await app.register(officeSettingsRoutes, { db })
  await app.register(memberRoutes, { db, auth })
  await app.register(auditRoutes, { db })
  await app.register(referenceRoutes, {
    prefix: "/v1/reference",
    authenticate: [app.requireOffice],
    engineUrl: config.ENGINE_REGIME_REGULAR_URL,
    timeoutMs: config.ENGINE_TIMEOUT_MS,
    ttlSeconds: config.REFERENCE_CACHE_TTL_SECONDS,
  })

  await app.register(clientRoutes, {
    db,
    authenticate: [app.requireOffice],
    lookup:
      deps.cnpjLookup ??
      new CnpjLookup(
        brasilApiProvider({
          baseUrl: config.CNPJ_LOOKUP_URL,
          timeoutMs: config.CNPJ_LOOKUP_TIMEOUT_MS,
        }),
      ),
  })

  app.get("/openapi.json", { schema: { hide: true } }, () => app.swagger())

  return app
}

export type App = Awaited<ReturnType<typeof buildApp>>

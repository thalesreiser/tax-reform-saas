import { randomUUID } from "node:crypto"
import fastifySwagger from "@fastify/swagger"
import Fastify from "fastify"
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod"
import type { Config } from "./config.js"
import { errorHandler, problem, sendProblem } from "./problem.js"
import { healthRoutes } from "./routes/health.js"

export const REQUEST_ID_HEADER = "x-request-id"

/** Paths whose values must never reach the logs: credentials and API keys. */
const REDACTED = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
]

/**
 * Builds the API without listening, so tests use `app.inject()`. Routes added before
 * `app.ready()` are part of the OpenAPI document.
 */
export async function buildApp(config: Config) {
  const base = Fastify({
    logger: { level: config.LOG_LEVEL, redact: { paths: REDACTED, censor: "[redacted]" } },
    // The id is always generated here: a client-supplied id is not trusted and never echoed.
    genReqId: () => randomUUID(),
    requestIdHeader: false,
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

  const app = base.withTypeProvider<ZodTypeProvider>()

  await app.register(fastifySwagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Tax reform API",
        description: "CBS, IBS and IS calculation for accounting offices and their clients.",
        version: config.APP_VERSION,
      },
      tags: [{ name: "system", description: "Health and metadata" }],
    },
    transform: jsonSchemaTransform,
  })

  await app.register(healthRoutes, { version: config.APP_VERSION })

  app.get("/openapi.json", { schema: { hide: true } }, () => app.swagger())

  return app
}

export type App = Awaited<ReturnType<typeof buildApp>>

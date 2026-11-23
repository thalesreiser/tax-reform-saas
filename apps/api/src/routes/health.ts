import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod"

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
  uptimeSeconds: z.number().int().nonnegative(),
})

export interface HealthOptions {
  version: string
}

/** Liveness probe for the container host and uptime monitoring (EST-03.3). */
export const healthRoutes: FastifyPluginAsyncZod<HealthOptions> = (app, options) => {
  app.get(
    "/health",
    {
      schema: {
        tags: ["system"],
        summary: "Liveness probe",
        response: { 200: healthResponseSchema },
      },
    },
    () => ({
      status: "ok" as const,
      version: options.version,
      uptimeSeconds: Math.floor(process.uptime()),
    }),
  )
  return Promise.resolve()
}

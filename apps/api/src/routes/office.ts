import { eq } from "drizzle-orm"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod"
import { currentOffice } from "../auth/plugin.js"
import { OFFICE_ROLES } from "../auth/roles.js"
import { type Db, withOffice } from "../db/client.js"
import { offices } from "../db/schema.js"
import { problemSchema } from "../problem.js"

export const officeResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: z.enum(OFFICE_ROLES),
})

/** The active office of the session and the user's role in it (RF-01). */
export const officeRoutes: FastifyPluginAsyncZod<{ db: Db }> = (app, { db }) => {
  app.get(
    "/office",
    {
      preHandler: app.requireOffice,
      schema: {
        tags: ["office"],
        summary: "Active office of the session",
        response: { 200: officeResponseSchema, 401: problemSchema, 403: problemSchema },
      },
    },
    async (request) => {
      const office = currentOffice(request)
      // Read through row-level security: only the active office is visible.
      const [row] = await withOffice(db, office.id, (tx) =>
        tx
          .select({ id: offices.id, name: offices.name })
          .from(offices)
          .where(eq(offices.id, office.id)),
      )
      if (row === undefined) {
        throw Object.assign(new Error("No access to this office."), { statusCode: 403 })
      }
      return { ...row, role: office.role }
    },
  )
  return Promise.resolve()
}

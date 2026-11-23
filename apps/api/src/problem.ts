import { STATUS_CODES } from "node:http"
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify"
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod"
import { z } from "zod"

export const PROBLEM_CONTENT_TYPE = "application/problem+json"

/** Problem details (RFC 9457), the body of every error response. */
export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  requestId: z.string(),
  errors: z
    .array(
      z.object({
        location: z.string(),
        pointer: z.string(),
        detail: z.string(),
      }),
    )
    .optional(),
})

export type Problem = z.output<typeof problemSchema>

export function problem(
  request: FastifyRequest,
  status: number,
  fields: Partial<Omit<Problem, "status" | "requestId">> = {},
): Problem {
  return {
    type: fields.type ?? "about:blank",
    title: fields.title ?? STATUS_CODES[status] ?? "Error",
    status,
    requestId: request.id,
    ...(fields.detail === undefined ? {} : { detail: fields.detail }),
    ...(fields.errors === undefined ? {} : { errors: fields.errors }),
  }
}

export function sendProblem(reply: FastifyReply, body: Problem): FastifyReply {
  return reply.code(body.status).type(PROBLEM_CONTENT_TYPE).send(body)
}

/**
 * Maps any thrown error to problem details. Validation errors list each invalid field; other 4xx
 * keep their message; 5xx answers are generic and the cause goes only to the log.
 */
export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (hasZodFastifySchemaValidationErrors(error)) {
    return sendProblem(
      reply,
      problem(request, 400, {
        detail: "The request has invalid fields.",
        errors: error.validation.map((v) => ({
          location: error.validationContext ?? "body",
          pointer: v.instancePath === "" ? "/" : v.instancePath,
          detail: v.message ?? "Invalid value",
        })),
      }),
    )
  }

  const status = error.statusCode ?? 500
  if (status >= 400 && status < 500) {
    return sendProblem(reply, problem(request, status, { detail: error.message }))
  }

  request.log.error({ err: error }, "unhandled error")
  return sendProblem(reply, problem(request, 500))
}

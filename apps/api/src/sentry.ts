import { createHash } from "node:crypto"
import * as Sentry from "@sentry/node"
import type { FastifyRequest } from "fastify"
import type { Config } from "./config.js"

/** CNPJ (formatted or 14 digits), CPF (formatted or 11 digits) and e-mail addresses. */
const SENSITIVE_TEXT = [
  /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
]

/** Masks fiscal identifiers and e-mail addresses that may appear in an error message. */
export function scrubText(text: string): string {
  return SENSITIVE_TEXT.reduce((acc, pattern) => acc.replace(pattern, "[redacted]"), text)
}

/** Short, one-way id of an office: correlates events without sending the office id or name. */
export function hashOfficeId(officeId: string): string {
  return createHash("sha256").update(officeId).digest("hex").slice(0, 16)
}

/**
 * Last line of defence before an event leaves the process: keeps only the method of the request
 * (the route pattern and request id are tags) and drops headers, cookies, query strings, bodies,
 * user data, extra data and breadcrumbs. Exception messages are masked.
 */
export function scrubEvent<T extends Sentry.ErrorEvent>(event: T): T {
  if (event.request !== undefined) {
    event.request = event.request.method === undefined ? {} : { method: event.request.method }
  }
  delete event.user
  delete event.extra
  delete event.breadcrumbs
  delete event.server_name
  if (event.contexts !== undefined) {
    const { trace, runtime, os, app } = event.contexts
    event.contexts = {
      ...(trace && { trace }),
      ...(runtime && { runtime }),
      ...(os && { os }),
      ...(app && { app }),
    }
  }
  if (event.message !== undefined) event.message = scrubText(event.message)
  for (const exception of event.exception?.values ?? []) {
    if (exception.value !== undefined) exception.value = scrubText(exception.value)
    for (const frame of exception.stacktrace?.frames ?? []) delete frame.vars
  }
  return event
}

/** Starts error tracking when SENTRY_DSN is set; otherwise nothing is loaded or sent. */
export function initSentry(config: Config): boolean {
  if (config.SENTRY_DSN === undefined) return false
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.SENTRY_ENVIRONMENT,
    release: config.APP_VERSION,
    tracesSampleRate: config.SENTRY_TRACES_SAMPLE_RATE,
    sendDefaultPii: false,
    maxBreadcrumbs: 0,
    beforeSend: scrubEvent,
    beforeSendTransaction: (event) => {
      if (event.request !== undefined) event.request = {}
      delete event.user
      return event
    },
  })
  return true
}

/**
 * Reports a 5xx or unhandled error with the request id, route pattern and office hash as tags.
 * A no-op when Sentry was not started.
 */
export function captureServerError(error: unknown, request: FastifyRequest): void {
  if (Sentry.getClient() === undefined) return
  Sentry.withScope((scope) => {
    scope.setTag("request_id", request.id)
    scope.setTag("route", request.routeOptions.url ?? "unmatched")
    scope.setTag("method", request.method)
    if (request.office) scope.setTag("office_hash", hashOfficeId(request.office.id))
    Sentry.captureException(error)
  })
}

/** Sends pending events before the process exits. */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (Sentry.getClient() !== undefined) await Sentry.close(timeoutMs)
}

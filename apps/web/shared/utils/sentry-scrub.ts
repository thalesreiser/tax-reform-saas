// Scrubbing shared by the browser and the Worker Sentry clients (EST-03.3). Type-only import: no
// Sentry code is loaded by this file.
import type { ErrorEvent } from "@sentry/vue"

/** CNPJ and CPF (formatted or digits only) and e-mail addresses. */
const SENSITIVE_TEXT = [
  /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
]

export function scrubSentryText(text: string): string {
  return SENSITIVE_TEXT.reduce((acc, pattern) => acc.replace(pattern, "[redacted]"), text)
}

/**
 * Keeps the method and the path of the request (no query string or fragment) and drops headers,
 * cookies, bodies, form values, user data, extra data and breadcrumbs. Messages are masked.
 */
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  if (event.request !== undefined) {
    const { method, url } = event.request
    event.request = {
      ...(method !== undefined && { method }),
      ...(url !== undefined && { url: scrubSentryText(url.split(/[?#]/)[0] ?? "") }),
    }
  }
  delete event.user
  delete event.extra
  delete event.breadcrumbs
  delete event.server_name
  if (event.message !== undefined) event.message = scrubSentryText(event.message)
  for (const exception of event.exception?.values ?? []) {
    if (exception.value !== undefined) exception.value = scrubSentryText(exception.value)
    for (const frame of exception.stacktrace?.frames ?? []) delete frame.vars
  }
  return event
}

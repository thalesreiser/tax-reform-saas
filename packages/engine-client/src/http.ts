import { InvalidDecimalError } from "./decimals.js"
import { toHttpError, type EngineError, type EngineResult } from "./errors.js"

export interface EngineClientOptions {
  /** Engine root, e.g. `http://regime-regular:8080` (the client adds the `/api` context path). */
  baseUrl: string
  /** Per-call timeout in milliseconds, including reading the body. Default 10 000. */
  timeoutMs?: number
  /**
   * Extra attempts for GET requests after a network error, a timeout or an HTTP 5xx. Default 0.
   * POST requests are never retried: a calculation is cheap to ask again, but the caller decides.
   */
  getRetries?: number
  /** Fetch implementation (tests, instrumentation). Default `globalThis.fetch`. */
  fetch?: (request: Request) => Promise<Response>
}

export interface CallOptions {
  /** Cancels the call; combined with the timeout. */
  signal?: AbortSignal
}

/** What an openapi-fetch call resolves to, reduced to what the client reads. */
export interface RawResponse {
  data?: unknown
  error?: unknown
  response: Response
}

export const DEFAULT_TIMEOUT_MS = 10_000

/** Engine root without trailing slashes, plus the Spring context path of both engines. */
export function apiBaseUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api`
}

class NetworkError extends Error {}

/** Wraps the fetch implementation so a transport failure can be told apart from a parsing one. */
export function transportFetch(
  fetchImpl: (request: Request) => Promise<Response> = (request) => globalThis.fetch(request),
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      return await fetchImpl(request)
    } catch (cause) {
      throw new NetworkError(cause instanceof Error ? cause.message : "fetch failed", { cause })
    }
  }
}

/**
 * Runs one engine call with a timeout and maps every outcome to an `EngineResult`; it never throws.
 * `map` turns the 2xx body into the result value and may throw to reject a body off the contract.
 */
export async function call<T>(
  options: EngineClientOptions,
  method: "GET" | "POST",
  send: (signal: AbortSignal) => Promise<RawResponse>,
  map: (data: unknown) => T,
  callOptions: CallOptions = {},
): Promise<EngineResult<T>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const attempts = method === "GET" ? 1 + Math.max(0, options.getRetries ?? 0) : 1
  let result: EngineResult<T> = { ok: false, error: { kind: "timeout", timeoutMs } }
  for (let attempt = 0; attempt < attempts; attempt++) {
    result = await attemptOnce(timeoutMs, send, map, callOptions.signal)
    if (result.ok || !retryable(result.error) || callOptions.signal?.aborted) break
  }
  return result
}

function retryable(error: EngineError): boolean {
  if (error.kind === "timeout" || error.kind === "network") return true
  return (error.kind === "problem" || error.kind === "http") && error.status >= 500
}

async function attemptOnce<T>(
  timeoutMs: number,
  send: (signal: AbortSignal) => Promise<RawResponse>,
  map: (data: unknown) => T,
  callerSignal: AbortSignal | undefined,
): Promise<EngineResult<T>> {
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = callerSignal ? AbortSignal.any([timeout, callerSignal]) : timeout
  let raw: RawResponse
  try {
    raw = await send(signal)
  } catch (cause) {
    if (timeout.aborted) return { ok: false, error: { kind: "timeout", timeoutMs } }
    if (cause instanceof NetworkError) {
      return { ok: false, error: { kind: "network", message: cause.message } }
    }
    // The engine answered 2xx but the body could not be read as declared (e.g. invalid JSON).
    return { ok: false, error: invalidResponse(0, cause) }
  }
  const { status } = raw.response
  if (!raw.response.ok) return { ok: false, error: toHttpError(status, raw.error) }
  try {
    return { ok: true, value: map(raw.data) }
  } catch (cause) {
    return { ok: false, error: invalidResponse(status, cause) }
  }
}

// Only our own messages: a parser message could quote the body, which may hold fiscal data.
function invalidResponse(status: number, cause: unknown): EngineError {
  const message =
    cause instanceof InvalidDecimalError
      ? cause.message
      : "the response body does not match the contract"
  return { kind: "invalid-response", status, message }
}

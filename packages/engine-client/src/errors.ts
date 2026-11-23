/**
 * Error codes of the engines' catalogues: REG, CAL and VAL (regime regular), VSN (Simples Nacional).
 * Other strings are kept as they come, so a code added upstream still reaches the caller.
 */
export type EngineErrorCode =
  `REG-${string}` | `CAL-${string}` | `VAL-${string}` | `VSN-${string}` | (string & {})

/** One error reported by an engine (RFC 9457 `errors[]` item, or an item's `erros[]`). */
export interface EngineErrorItem {
  /** Catalogue code, e.g. `REG-011`; absent for generic validation errors. */
  code?: EngineErrorCode
  title?: string
  /** JSON Pointer (RFC 6901) to the request field, e.g. `#/itens/3/ncm`. */
  pointer?: string
  detail?: string
  /** URI of the catalogue entry. */
  type?: string
}

/** Why a call failed. Item-level validation errors are not failures: see the item results. */
export type EngineError =
  /** HTTP 4xx/5xx with a problem details body. `code` is the first item's code, if any. */
  | {
      kind: "problem"
      status: number
      code?: EngineErrorCode
      title?: string
      detail?: string
      type?: string
      errors: EngineErrorItem[]
    }
  /** HTTP error without a problem details body. */
  | { kind: "http"; status: number }
  /** No answer within the timeout. */
  | { kind: "timeout"; timeoutMs: number }
  /** Connection refused, DNS failure, reset, etc. */
  | { kind: "network"; message: string }
  /** HTTP 2xx whose body does not match the contract (e.g. a decimal field that is not one). */
  | { kind: "invalid-response"; status: number; message: string }

export type EngineResult<T> = { ok: true; value: T } | { ok: false; error: EngineError }

const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined)

export function toErrorItem(raw: unknown): EngineErrorItem {
  const item = (raw ?? {}) as Record<string, unknown>
  const result: EngineErrorItem = {}
  for (const key of ["code", "title", "pointer", "detail", "type"] as const) {
    const value = text(item[key])
    if (value !== undefined) result[key] = value
  }
  return result
}

/** Maps an HTTP error response body (already parsed, or text) to an `EngineError`. */
export function toHttpError(status: number, body: unknown): EngineError {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { kind: "http", status }
  }
  const problem = body as Record<string, unknown>
  const errors = Array.isArray(problem.errors) ? problem.errors.map(toErrorItem) : []
  const error: EngineError = { kind: "problem", status, errors }
  const code = errors.find((item) => item.code)?.code
  if (code !== undefined) error.code = code
  for (const key of ["title", "detail", "type"] as const) {
    const value = text(problem[key])
    if (value !== undefined) error[key] = value
  }
  return error
}

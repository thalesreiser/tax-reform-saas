import { toErrorItem, type EngineErrorItem } from "./errors.js"

/** States in which the engine computed the item (CALCULO_SIMULADO: simulated reference rates). */
const CALCULATED = new Set(["CALCULADO", "CALCULO_SIMULADO"])

interface EngineItem {
  estadoItem?: string
  erros?: unknown[]
  tribCalc?: unknown
}

/**
 * One item of an observability response. Per-item errors (INCONSISTENCIA_ENTRADA with `REG-011`,
 * etc.) are results, not exceptions: the rest of the document is still calculated.
 */
export type ItemResult<I extends EngineItem> =
  | (Omit<I, "erros"> & { status: "calculated" })
  | (Omit<I, "erros" | "tribCalc"> & { status: "not-calculated"; errors: EngineErrorItem[] })

export function toItemResult<I extends EngineItem>(item: I): ItemResult<I> {
  const { erros, ...rest } = item
  const errors = Array.isArray(erros) ? erros.map(toErrorItem) : []
  if (errors.length === 0 && CALCULATED.has(item.estadoItem ?? "")) {
    return { ...rest, status: "calculated" }
  }
  const { tribCalc: _tribCalc, ...withoutTaxes } = rest
  const failed = { ...withoutTaxes, status: "not-calculated" as const, errors }
  return failed as unknown as ItemResult<I>
}

/** Replaces `objetos` with typed `items`. */
export function withItems<R extends { objetos?: EngineItem[] | undefined }>(
  response: R,
): Omit<R, "objetos"> & { items: ItemResult<NonNullable<R["objetos"]>[number]>[] } {
  const { objetos, ...rest } = response
  const items = (objetos ?? []).map((item) => toItemResult(item))
  return { ...rest, items: items as ItemResult<NonNullable<R["objetos"]>[number]>[] }
}

/** Rejects a 2xx body that is not a JSON object. */
export function asObject(data: unknown): object {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new TypeError("the response body is not an object")
  }
  return data
}

import { dec, Fiscal, type FiscalDecimal } from "@trs/tax-legacy"
import type { DecimalText } from "./decimal-text.js"

/** Where the decimal fields of a schema are (generated from the OpenAPI documents). */
export type DecimalShape =
  | "decimal"
  | { readonly ref: string }
  | { readonly items: DecimalShape }
  | { readonly props: Readonly<Record<string, DecimalShape>> }

export type DecimalShapes = Readonly<Record<string, DecimalShape>>

/** An engine response type with every decimal field as a `Decimal`. */
export type Decimalized<T> = T extends DecimalText
  ? FiscalDecimal
  : T extends readonly (infer U)[]
    ? Decimalized<U>[]
    : T extends object
      ? { [K in keyof T]: Decimalized<T[K]> }
      : T

/** An engine request type that takes a `Decimal` (or its text) wherever the engine takes a decimal. */
export type DecimalInput<T> = T extends DecimalText
  ? FiscalDecimal | string
  : T extends readonly (infer U)[]
    ? DecimalInput<U>[]
    : T extends object
      ? { [K in keyof T]: DecimalInput<T[K]> }
      : T

/** A value in a decimal position that is not a plain decimal. */
export class InvalidDecimalError extends Error {}

// A JavaScript number keeps up to 15 significant digits exactly, so `String(n)` gives back the text
// the engine sent. Beyond that (or in exponent form) the value is rejected, never approximated.
const SAFE_NUMBER_TEXT = /^-?(?=(?:\d\.?){1,15}$)\d+(\.\d+)?$/

function toDecimal(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === "string") {
    try {
      return dec(value)
    } catch {
      throw new InvalidDecimalError("a decimal field is not a plain decimal")
    }
  }
  if (typeof value === "number" && SAFE_NUMBER_TEXT.test(String(value))) return dec(String(value))
  throw new InvalidDecimalError(`a decimal field is a ${typeof value}`)
}

/** Converts the decimal fields of a parsed engine response, following its generated shape. */
export function decimalize(value: unknown, shape: DecimalShape, shapes: DecimalShapes): unknown {
  if (shape === "decimal") return toDecimal(value)
  if (value === null || typeof value !== "object") return value
  if ("ref" in shape) {
    const target = shapes[shape.ref]
    return target ? decimalize(value, target, shapes) : value
  }
  if ("items" in shape) {
    return Array.isArray(value) ? value.map((item) => decimalize(item, shape.items, shapes)) : value
  }
  const result: Record<string, unknown> = { ...(value as Record<string, unknown>) }
  for (const [key, inner] of Object.entries(shape.props)) {
    if (key in result) result[key] = decimalize(result[key], inner, shapes)
  }
  return result
}

/** Request bodies: every `Decimal` becomes its plain text (no exponent), which the engines accept. */
export function toWire(value: unknown): unknown {
  if (Fiscal.isDecimal(value)) return value.toFixed()
  if (Array.isArray(value)) return value.map(toWire)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toWire(v)]))
  }
  return value
}

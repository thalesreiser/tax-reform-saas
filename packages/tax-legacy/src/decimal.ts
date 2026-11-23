import Decimal from "decimal.js"

/**
 * Numeric policy, aligned with the official engine (Receita Federal, calculadora-rtc ADR003):
 *
 * 1. One rounding mode, HALF_EVEN (ABNT NBR 5891).
 * 2. Internal arithmetic is exact: 34 significant digits, which keeps addition, subtraction and
 *    multiplication of fiscal amounts exact and bounds non-terminating divisions.
 * 3. Each published number is rounded once, at its layout scale: amounts to 2 decimal places,
 *    rates (in percent) to 4.
 * 4. The published number is the one that enters the next calculation.
 *
 * Amounts never come from JavaScript `number`, so binary floating point cannot leak into a result.
 */
export const Fiscal = Decimal.clone({
  precision: 34,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -40,
  toExpPos: 40,
})

export type FiscalDecimal = Decimal

/** Decimal places of a published amount (R$). */
export const AMOUNT_SCALE = 2
/** Decimal places of a published rate, in percent. */
export const RATE_SCALE = 4

const DECIMAL_TEXT = /^-?\d+(\.\d+)?$/

/**
 * Parses a decimal from its text form ("1234.56"). Numbers are rejected on purpose: `0.1 + 0.2`
 * style errors must stop at the boundary, so callers parse user input and table values as strings.
 */
export function dec(value: string | Decimal): Decimal {
  if (value instanceof Decimal) return new Fiscal(value)
  if (!DECIMAL_TEXT.test(value)) {
    throw new TypeError(`Not a plain decimal: "${value}"`)
  }
  return new Fiscal(value)
}

/** Rounds an amount to its published scale (2 places, HALF_EVEN). */
export function toAmount(value: Decimal): Decimal {
  return new Fiscal(value).toDecimalPlaces(AMOUNT_SCALE, Decimal.ROUND_HALF_EVEN)
}

/** Rounds a percent rate to its published scale (4 places, HALF_EVEN). */
export function toRate(value: Decimal): Decimal {
  return new Fiscal(value).toDecimalPlaces(RATE_SCALE, Decimal.ROUND_HALF_EVEN)
}

/** Exact `base × ratePercent ÷ 100`, not rounded. */
export function percentOf(base: Decimal, ratePercent: Decimal): Decimal {
  return new Fiscal(base).times(ratePercent).dividedBy(100)
}

/** Exact sum; callers pass published (already rounded) amounts. */
export function sum(values: readonly Decimal[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(v), new Fiscal(0))
}

/** Text form with a fixed number of places, for tables, logs and API payloads. */
export function format(value: Decimal, places: number): string {
  return new Fiscal(value).toFixed(places, Decimal.ROUND_HALF_EVEN)
}

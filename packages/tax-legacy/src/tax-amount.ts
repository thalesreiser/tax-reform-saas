import type Decimal from "decimal.js"
import { percentOf, sum, toAmount, toRate } from "./decimal.js"
import type { LegalSource, ResolvedRule } from "./rule-table.js"

/** Consumption taxes replaced by the reform (current system). */
export const CURRENT_TAXES = ["SIMPLES", "PIS", "COFINS", "IPI", "ICMS", "ISS"] as const
export type CurrentTax = (typeof CURRENT_TAXES)[number]

/** One tax computed by the current-tax engine, with everything needed to audit it. */
export interface TaxAmount {
  tax: CurrentTax
  /** Published base, 2 places. */
  base: Decimal
  /** Published rate in percent, 4 places. */
  rate: Decimal
  /** Published amount, 2 places: `round2(base × rate ÷ 100)`. */
  amount: Decimal
  /** Rule table versions used (`<table>@<validFrom>`). */
  ruleVersions: string[]
  sources: LegalSource[]
  /** Plain-language notices for the user, e.g. "ICMS-ST not included". */
  notices: string[]
}

export interface TaxAmountInput {
  tax: CurrentTax
  base: Decimal
  /** Rate in percent, before publication rounding. */
  rate: Decimal
  /** Rules that produced the rate or the base. */
  rules: readonly ResolvedRule<unknown>[]
  notices?: readonly string[]
}

/**
 * Applies the official engine's publication order: the base is rounded to 2 places and the rate
 * to 4, and the published values are the ones multiplied.
 */
export function calculateTaxAmount(input: TaxAmountInput): TaxAmount {
  const base = toAmount(input.base)
  const rate = toRate(input.rate)
  return {
    tax: input.tax,
    base,
    rate,
    amount: toAmount(percentOf(base, rate)),
    ruleVersions: unique(input.rules.map((r) => r.versionId)),
    sources: input.rules.map((r) => r.source),
    notices: [...(input.notices ?? [])],
  }
}

/** Total of published amounts; never re-rounds the parts. */
export function totalAmount(amounts: readonly TaxAmount[]): Decimal {
  return sum(amounts.map((a) => a.amount))
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

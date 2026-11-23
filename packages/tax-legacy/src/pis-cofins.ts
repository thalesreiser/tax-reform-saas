import type Decimal from "decimal.js"
import { Fiscal, dec } from "./decimal.js"
import { defineRuleTable, resolveRule, type IsoDate, type RuleTable } from "./rule-table.js"
import { calculateTaxAmount, type TaxAmount } from "./tax-amount.js"

/**
 * PIS/Pasep and Cofins, general rates of the current system (RF-04).
 *
 * - Cumulative regime (lucro presumido or arbitrado: Lei 10.637/2002, art. 8º, II; Lei 10.833/2003,
 *   art. 10, II): rate on gross revenue (Lei 9.718/1998, arts. 2º and 3º), no credits.
 * - Non-cumulative regime (lucro real): rate on total monthly revenue (art. 1º of both laws), minus
 *   credits computed at the same rate on goods bought for resale and inputs (art. 3º, I and II and
 *   § 1º of both laws). Unused credit carries forward (art. 3º, § 4º of both laws).
 *
 * The end of PIS/Cofins from 2027 (LC 214/2025) is not encoded here: the transition schedule
 * (MOT-03.1) owns it. Tables stay open-ended until then.
 *
 * Tables start on the first day the cited provisions apply. The cumulative tables start on
 * 1999-02-01, when the Lei 9.718/1998 base and the 3% Cofins rate took effect (art. 17, I); earlier
 * periods (Cofins 2% under LC 70/1991, art. 2º) are out of scope for a 2026-2033 simulator.
 */

const PLANALTO = "https://www.planalto.gov.br/ccivil_03/leis"

/** Rates in percent, as text, so they are parsed exactly. */
export const PIS_CUMULATIVE_RATE: RuleTable<string> = defineRuleTable("pis.cumulative.rate", [
  {
    validFrom: "1999-02-01",
    source: {
      norm: "Lei 9.715/1998",
      provision: "art. 8º, I (0,65%); base per Lei 9.718/1998, arts. 2º, 3º and 17, I",
      url: `${PLANALTO}/l9715.htm`,
    },
    value: "0.65",
  },
])

export const COFINS_CUMULATIVE_RATE: RuleTable<string> = defineRuleTable("cofins.cumulative.rate", [
  {
    validFrom: "1999-02-01",
    source: {
      norm: "Lei 9.718/1998",
      provision: "art. 8º (3%); base per arts. 2º and 3º; effects per art. 17, I",
      url: `${PLANALTO}/l9718compilada.htm`,
    },
    value: "3",
  },
])

export const PIS_NON_CUMULATIVE_RATE: RuleTable<string> = defineRuleTable(
  "pis.non-cumulative.rate",
  [
    {
      validFrom: "2002-12-01",
      source: {
        norm: "Lei 10.637/2002",
        provision: "art. 2º, caput (1,65%); credits per art. 3º, § 1º; effects per art. 68, II",
        url: `${PLANALTO}/2002/l10637.htm`,
      },
      value: "1.65",
    },
  ],
)

export const COFINS_NON_CUMULATIVE_RATE: RuleTable<string> = defineRuleTable(
  "cofins.non-cumulative.rate",
  [
    {
      validFrom: "2004-02-01",
      source: {
        norm: "Lei 10.833/2003",
        provision: "art. 2º, caput (7,6%); credits per art. 3º, § 1º; effects per art. 93, I",
        url: `${PLANALTO}/2003/l10.833.htm`,
      },
      value: "7.6",
    },
  ],
)

/** User-facing notices (pt-BR). */
export const PIS_COFINS_SCOPE_NOTICE =
  "Cálculo pelas alíquotas gerais. Não considera produtos monofásicos, alíquota zero, suspensão, " +
  "regimes especiais, receitas financeiras nem créditos além das compras."
export const PIS_COFINS_EXCESS_CREDIT_NOTICE =
  "Os créditos superam o débito no período: o valor devido é zero e o crédito excedente pode ser " +
  "aproveitado nos meses seguintes."
export const PIS_COFINS_NO_CREDIT_CUMULATIVE_NOTICE =
  "No regime cumulativo não há créditos: as compras informadas não reduzem o valor devido."

export type PisCofinsRegime = "CUMULATIVE" | "NON_CUMULATIVE"

export interface PisCofinsInput {
  regime: PisCofinsRegime
  /** Date of the taxable event (ISO), used to resolve the rule tables. */
  date: IsoDate
  /** Revenue base: gross revenue (cumulative) or total monthly revenue (non-cumulative). */
  revenue: Decimal
  /** Purchases that give credit (goods for resale and inputs). Only used when non-cumulative. */
  creditablePurchases?: Decimal
}

/**
 * A `TaxAmount` with the credit breakdown. `base`, `rate` and `ruleVersions` describe the debit;
 * `amount` is the net amount due (`debit − credit`, never negative), so `totalAmount` and other
 * `TaxAmount` consumers keep working. In the cumulative regime `amount` equals `debit`.
 */
export interface PisCofinsTax extends TaxAmount {
  /** Published debit: `round2(base × rate ÷ 100)`. */
  debit: Decimal
  /** Published credit base, 2 places; zero in the cumulative regime. */
  creditBase: Decimal
  /** Published credit: `round2(creditBase × rate ÷ 100)`. */
  credit: Decimal
  /** Credit above the debit, carried forward to later months; zero otherwise. */
  excessCredit: Decimal
}

export interface PisCofinsResult {
  pis: PisCofinsTax
  cofins: PisCofinsTax
}

const TABLES = {
  CUMULATIVE: { PIS: PIS_CUMULATIVE_RATE, COFINS: COFINS_CUMULATIVE_RATE },
  NON_CUMULATIVE: { PIS: PIS_NON_CUMULATIVE_RATE, COFINS: COFINS_NON_CUMULATIVE_RATE },
} as const

export function calculatePisCofins(input: PisCofinsInput): PisCofinsResult {
  const zero = new Fiscal(0)
  if (input.revenue.isNegative()) throw new RangeError("Revenue must not be negative")
  if (input.creditablePurchases?.isNegative()) {
    throw new RangeError("Creditable purchases must not be negative")
  }
  const purchases = input.creditablePurchases ?? zero
  const cumulative = input.regime === "CUMULATIVE"
  const ignoredPurchases = cumulative && !purchases.isZero()

  const compute = (tax: "PIS" | "COFINS"): PisCofinsTax => {
    const rule = resolveRule(TABLES[input.regime][tax], input.date)
    const rate = dec(rule.value)
    const debit = calculateTaxAmount({ tax, base: input.revenue, rate, rules: [rule] })
    const credit = calculateTaxAmount({
      tax,
      base: cumulative ? zero : purchases,
      rate,
      rules: [rule],
    })
    const net = debit.amount.minus(credit.amount)
    const notices = [PIS_COFINS_SCOPE_NOTICE]
    if (ignoredPurchases) notices.push(PIS_COFINS_NO_CREDIT_CUMULATIVE_NOTICE)
    if (net.isNegative()) notices.push(PIS_COFINS_EXCESS_CREDIT_NOTICE)
    return {
      ...debit,
      amount: net.isNegative() ? zero : net,
      notices,
      debit: debit.amount,
      creditBase: credit.base,
      credit: credit.amount,
      excessCredit: net.isNegative() ? net.negated() : zero,
    }
  }

  return { pis: compute("PIS"), cofins: compute("COFINS") }
}

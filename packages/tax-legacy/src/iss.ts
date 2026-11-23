import type Decimal from "decimal.js"
import { dec } from "./decimal.js"
import { type IsoDate, defineRuleTable, resolveRule } from "./rule-table.js"
import { type TaxAmount, calculateTaxAmount } from "./tax-amount.js"

const LC_116_URL = "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp116.htm"

/**
 * Maximum ISS rate, in percent. LC 116/2003 was published in the DOU on 1 Aug 2003 and is in force
 * from its publication (art. 9º). Art. 8º, I (specific services) was vetoed, so 5% applies to all
 * services.
 */
export const ISS_MAX_RATE = defineRuleTable<string>("iss.max-rate", [
  {
    validFrom: "2003-08-01",
    source: { norm: "LC 116/2003", provision: "art. 8º, II", url: LC_116_URL },
    value: "5",
  },
])

/**
 * Minimum ISS rate, in percent.
 *
 * - From 13 Jun 2002 (EC 37/2002, DOU 13 Jun 2002): ADCT art. 88, I, 2% while no complementary law
 *   regulates CF art. 156, § 3º, I and III.
 * - LC 157/2016 (DOU 30 Dec 2016) added art. 8º-A to LC 116/2003. Its art. 7º, § 1º defers the
 *   effects of art. 8º-A, caput, until the one-year term of its art. 6º, counted from publication,
 *   has elapsed. Counting the publication day and the last day (LC 95/1998, art. 8º, § 1º), the term
 *   ends on 29 Dec 2017 and art. 8º-A applies from 30 Dec 2017.
 */
export const ISS_MIN_RATE = defineRuleTable<string>("iss.min-rate", [
  {
    validFrom: "2002-06-13",
    validTo: "2017-12-29",
    source: {
      norm: "ADCT (EC 37/2002)",
      provision: "art. 88, I",
      url: "https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc37.htm",
    },
    value: "2",
  },
  {
    validFrom: "2017-12-30",
    source: {
      norm: "LC 116/2003",
      provision: "art. 8º-A, caput (incluído pela LC 157/2016)",
      url: LC_116_URL,
    },
    value: "2",
  },
])

/** What this calculation leaves out, shown to the user with every ISS result. */
export const ISS_NOTICES = [
  "Exceções à alíquota mínima de ISS (subitens 7.02, 7.05 e 16.01 da lista da LC 116/2003) não são consideradas.",
  "Deduções da base de cálculo do ISS (como materiais fornecidos em obras, subitens 7.02 e 7.05) não são consideradas.",
] as const

export class IssRateOutOfRangeError extends RangeError {
  override name = "IssRateOutOfRangeError"

  constructor(
    readonly rate: Decimal,
    readonly min: Decimal,
    readonly max: Decimal,
  ) {
    super(
      `Alíquota de ISS deve estar entre ${percent(min)} e ${percent(max)} (informada: ${percent(rate)}).`,
    )
  }
}

export interface IssInput {
  /** Date of the taxable event (service provided). */
  date: IsoDate
  /** Service value (tax base), R$. */
  base: Decimal
  /** Municipal rate in percent, as informed by the user (e.g. "3.5"). */
  rate: string | Decimal
}

/**
 * ISS on a service: `base × municipal rate`. The informed rate must lie within the limits in force
 * on the date (inclusive); it is checked before publication rounding so that, for example, 1.99999%
 * is not accepted as 2%.
 */
export function calculateIss(input: IssInput): TaxAmount {
  const min = resolveRule(ISS_MIN_RATE, input.date)
  const max = resolveRule(ISS_MAX_RATE, input.date)
  const rate = dec(input.rate)
  const minRate = dec(min.value)
  const maxRate = dec(max.value)
  if (rate.lessThan(minRate) || rate.greaterThan(maxRate)) {
    throw new IssRateOutOfRangeError(rate, minRate, maxRate)
  }
  return calculateTaxAmount({
    tax: "ISS",
    base: input.base,
    rate,
    rules: [min, max],
    notices: ISS_NOTICES,
  })
}

/** pt-BR percent text: "2%", "6,5%". */
function percent(value: Decimal): string {
  return `${value.toString().replace(".", ",")}%`
}

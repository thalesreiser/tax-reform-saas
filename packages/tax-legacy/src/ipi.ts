import type Decimal from "decimal.js"
import { Fiscal, sum } from "./decimal.js"
import { defineRuleTable, resolveRule, type IsoDate } from "./rule-table.js"
import { calculateTaxAmount, type TaxAmount } from "./tax-amount.js"

/**
 * IPI (Imposto sobre Produtos Industrializados) on the domestic sale of a product by an industrial
 * or equivalent establishment.
 *
 * The TIPI table is NOT embedded in the MVP: the user informs the product's TIPI rate (or its "NT"
 * notation) and this module computes the taxable value and the amount. Out of scope here: imports
 * (Lei 4.502/1964, art. 14, I), specific (ad rem) rates, consignment, the vehicle exclusions of
 * RIPI art. 190, §§ 5º-6º, and the reform's IPI zeroing from 2027, owned by MOT-03.1.
 */

/** Items that make up the taxable value of a domestic operation. */
export type IpiBaseComponent = "productPrice" | "freight" | "insurance" | "otherCharges"

/**
 * Taxable value of a domestic operation: the product price plus the freight and the other
 * accessory expenses (insurance, other charges) billed by the taxpayer to the buyer.
 * Validity starts at the earliest simulation date the product supports (2026-01-01); the rule
 * itself is older and earlier periods are not modelled.
 */
export const IPI_TAXABLE_VALUE = defineRuleTable<readonly IpiBaseComponent[]>("ipi.taxable-value", [
  {
    validFrom: "2026-01-01",
    source: {
      norm: "Lei 4.502/1964",
      provision:
        "art. 14, II e § 1º (redação da Lei 7.798/1989); regulamentado pelo Decreto 7.212/2010 (RIPI), art. 190, II e § 1º",
      url: "https://www.planalto.gov.br/ccivil_03/leis/l4502.htm",
    },
    value: ["productPrice", "freight", "insurance", "otherCharges"],
  },
])

/** TIPI in force. The rate itself is informed by the user; the table records the edition. */
export const IPI_TIPI = defineRuleTable<{ edition: string }>("ipi.tipi", [
  {
    validFrom: "2026-01-01",
    source: {
      norm: "Decreto 11.158/2022 (TIPI)",
      provision: "art. 1º e Anexo",
      url: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2022/decreto/d11158.htm",
    },
    value: { edition: "Decreto 11.158/2022" },
  },
])

/** Products marked "NT" in the TIPI are outside the scope of the tax (no base, no amount). */
export const IPI_NOT_TAXED = defineRuleTable<{ outsideIncidence: true }>("ipi.not-taxed", [
  {
    validFrom: "2026-01-01",
    source: {
      norm: "Decreto 7.212/2010 (RIPI)",
      provision: "art. 2º, parágrafo único (Lei 10.451/2002, art. 6º)",
      url: "https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2010/decreto/d7212.htm",
    },
    value: { outsideIncidence: true },
  },
])

/** The product's TIPI classification: a rate in percent, or the "NT" (not taxed) notation. */
export type TipiRate = { rate: Decimal; notTaxed?: never } | { notTaxed: true; rate?: never }

export interface IpiInput {
  /** Date of the operation, `YYYY-MM-DD`. */
  date: IsoDate
  /** NCM code, 8 digits without punctuation. */
  ncm: string
  /** Rate informed by the user from the TIPI. */
  tipi: TipiRate
  /** Price of the product in the operation. */
  productPrice: Decimal
  /** Freight billed to the buyer. */
  freight?: Decimal
  /** Insurance billed to the buyer. */
  insurance?: Decimal
  /** Other accessory expenses billed to the buyer. */
  otherCharges?: Decimal
}

/** IPI amount; `notTaxed` tells an "NT" product apart from one taxed at 0%. */
export interface IpiAmount extends TaxAmount {
  tax: "IPI"
  notTaxed: boolean
}

export class IpiInputError extends Error {
  override name = "IpiInputError"
}

const NCM = /^\d{8}$/

export function isValidNcm(ncm: string): boolean {
  return NCM.test(ncm)
}

const TIPI_NOTICE =
  "Alíquota do IPI informada pelo usuário conforme a TIPI (Decreto 11.158/2022); a tabela não é consultada automaticamente."
const NT_NOTICE = "Produto com notação NT na TIPI: fora do campo de incidência do IPI."

export function calculateIpi(input: IpiInput): IpiAmount {
  if (!isValidNcm(input.ncm)) throw new IpiInputError("NCM must have exactly 8 digits")
  const rate = input.tipi.notTaxed === true ? undefined : input.tipi.rate
  if (input.tipi.notTaxed !== true && rate === undefined) {
    throw new IpiInputError("TIPI rate is missing")
  }
  if (rate?.isNegative()) throw new IpiInputError("IPI rate must not be negative")

  const values: Record<IpiBaseComponent, Decimal> = {
    productPrice: input.productPrice,
    freight: input.freight ?? new Fiscal(0),
    insurance: input.insurance ?? new Fiscal(0),
    otherCharges: input.otherCharges ?? new Fiscal(0),
  }
  for (const [name, value] of Object.entries(values)) {
    if (value.isNegative()) throw new IpiInputError(`${name} must not be negative`)
  }

  const tipi = resolveRule(IPI_TIPI, input.date)

  if (rate === undefined) {
    const notTaxed = resolveRule(IPI_NOT_TAXED, input.date)
    const result = calculateTaxAmount({
      tax: "IPI",
      base: new Fiscal(0),
      rate: new Fiscal(0),
      rules: [notTaxed, tipi],
      notices: [NT_NOTICE, TIPI_NOTICE],
    })
    return { ...result, tax: "IPI", notTaxed: true }
  }

  const taxableValue = resolveRule(IPI_TAXABLE_VALUE, input.date)
  const result = calculateTaxAmount({
    tax: "IPI",
    base: sum(taxableValue.value.map((component) => values[component])),
    rate,
    rules: [taxableValue, tipi],
    notices: [TIPI_NOTICE],
  })
  return { ...result, tax: "IPI", notTaxed: false }
}

import { describe, expect, it } from "vitest"
import {
  IPI_NOT_TAXED,
  IPI_TAXABLE_VALUE,
  IPI_TIPI,
  IpiInputError,
  calculateIpi,
  dec,
  format,
  isValidNcm,
  type IpiInput,
} from "../src/index.js"

// Fictional operation: NCM, values and rates are invented test data, not taken from the TIPI.
const operation = (overrides: Partial<IpiInput> = {}): IpiInput => ({
  date: "2026-05-10",
  ncm: "12345678",
  tipi: { rate: dec("6.5") },
  productPrice: dec("1000.00"),
  freight: dec("50.00"),
  insurance: dec("10.00"),
  otherCharges: dec("5.00"),
  ...overrides,
})

describe("isValidNcm", () => {
  it("accepts 8 digits", () => expect(isValidNcm("00000000")).toBe(true))
  it.each(["1234567", "123456789", "1234.56.78", "1234567a", " 12345678", ""])(
    "rejects %j",
    (ncm) => expect(isValidNcm(ncm)).toBe(false),
  )
})

describe("calculateIpi", () => {
  it("adds freight, insurance and other charges billed to the buyer to the price", () => {
    // base 1000 + 50 + 10 + 5 = 1065.00; 1065.00 × 6.5% = 69.225 → 69.22 (HALF_EVEN)
    const result = calculateIpi(operation())
    expect(result.tax).toBe("IPI")
    expect(result.notTaxed).toBe(false)
    expect(format(result.base, 2)).toBe("1065.00")
    expect(format(result.rate, 4)).toBe("6.5000")
    expect(format(result.amount, 2)).toBe("69.22")
  })

  it("records the rule table versions and the legal sources", () => {
    const result = calculateIpi(operation())
    expect(result.ruleVersions).toEqual([
      `${IPI_TAXABLE_VALUE.id}@2026-01-01`,
      `${IPI_TIPI.id}@2026-01-01`,
    ])
    expect(result.sources.map((s) => s.norm)).toEqual([
      "Lei 4.502/1964",
      "Decreto 11.158/2022 (TIPI)",
    ])
    expect(result.sources.every((s) => s.url?.startsWith("https://www.planalto.gov.br/"))).toBe(
      true,
    )
    expect(result.notices.some((n) => n.includes("Decreto 11.158/2022"))).toBe(true)
  })

  it("treats the optional charges as zero", () => {
    const result = calculateIpi({
      date: "2026-05-10",
      ncm: "12345678",
      tipi: { rate: dec("10") },
      productPrice: dec("200.00"),
    })
    expect(format(result.base, 2)).toBe("200.00")
    expect(format(result.amount, 2)).toBe("20.00")
  })

  it("computes zero at a 0% rate, still as a taxed product", () => {
    const result = calculateIpi(operation({ tipi: { rate: dec("0") } }))
    expect(result.notTaxed).toBe(false)
    expect(format(result.base, 2)).toBe("1065.00")
    expect(format(result.rate, 4)).toBe("0.0000")
    expect(format(result.amount, 2)).toBe("0.00")
  })

  it("keeps NT (not taxed) apart from 0%", () => {
    const result = calculateIpi(operation({ tipi: { notTaxed: true } }))
    expect(result.notTaxed).toBe(true)
    expect(format(result.base, 2)).toBe("0.00")
    expect(format(result.amount, 2)).toBe("0.00")
    expect(result.ruleVersions).toEqual([
      `${IPI_NOT_TAXED.id}@2026-01-01`,
      `${IPI_TIPI.id}@2026-01-01`,
    ])
    expect(result.notices.some((n) => n.includes("NT"))).toBe(true)
  })

  it.each([
    ["10.00", "12.50", "0.12"],
    ["11.00", "13.50", "0.14"],
  ])("rounds the amount half-even (price %s → base %s → %s)", (price, base, amount) => {
    // price + 2.00 freight + 0.30 insurance + 0.20 other charges, at 1%
    const result = calculateIpi(
      operation({
        tipi: { rate: dec("1") },
        productPrice: dec(price),
        freight: dec("2.00"),
        insurance: dec("0.30"),
        otherCharges: dec("0.20"),
      }),
    )
    expect(format(result.base, 2)).toBe(base)
    expect(format(result.amount, 2)).toBe(amount)
  })

  it.each(["1234567", "1234.56.78", "abcdefgh"])("rejects the invalid NCM %j", (ncm) => {
    expect(() => calculateIpi(operation({ ncm }))).toThrow(IpiInputError)
  })

  it("rejects a negative rate", () => {
    expect(() => calculateIpi(operation({ tipi: { rate: dec("-1") } }))).toThrow(IpiInputError)
  })

  it.each(["productPrice", "freight", "insurance", "otherCharges"] as const)(
    "rejects a negative %s",
    (field) => {
      const input = operation()
      input[field] = dec("-0.01")
      expect(() => calculateIpi(input)).toThrow(IpiInputError)
    },
  )

  it("has no rule before the supported period", () => {
    expect(() => calculateIpi(operation({ date: "2025-12-31" }))).toThrow(/no rule in force/)
  })
})

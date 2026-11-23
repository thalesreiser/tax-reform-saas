import { describe, expect, it } from "vitest"
import {
  calculateTaxAmount,
  dec,
  defineRuleTable,
  format,
  resolveRule,
  totalAmount,
} from "../src/index.js"

const table = defineRuleTable("test.rate", [
  { validFrom: "2020-01-01", source: { norm: "Lei Fictícia 1/2020" }, value: "3.52" },
])
const rule = resolveRule(table, "2026-03-10")

describe("calculateTaxAmount", () => {
  it("matches the official engine example (vBC 1200.00 × 3.52% = 42.24)", () => {
    const result = calculateTaxAmount({
      tax: "PIS",
      base: dec("1200"),
      rate: dec("3.52"),
      rules: [rule],
    })
    expect(format(result.base, 2)).toBe("1200.00")
    expect(format(result.rate, 4)).toBe("3.5200")
    expect(format(result.amount, 2)).toBe("42.24")
    expect(result.ruleVersions).toEqual(["test.rate@2020-01-01"])
    expect(result.sources).toEqual([{ norm: "Lei Fictícia 1/2020" }])
    expect(result.notices).toEqual([])
  })

  it("multiplies the published base and rate, not the raw ones", () => {
    // raw: 100.005 × 1.00005% = 1.0001... ; published: 100.00 × 1.0000% = 1.00
    const result = calculateTaxAmount({
      tax: "ISS",
      base: dec("100.005"),
      rate: dec("1.00005"),
      rules: [rule],
    })
    expect(format(result.base, 2)).toBe("100.00")
    expect(format(result.rate, 4)).toBe("1.0000")
    expect(format(result.amount, 2)).toBe("1.00")
  })

  it("rounds the amount half-even", () => {
    // 12.50 × 1% = 0.125 → 0.12
    const result = calculateTaxAmount({
      tax: "ICMS",
      base: dec("12.50"),
      rate: dec("1"),
      rules: [],
    })
    expect(format(result.amount, 2)).toBe("0.12")
  })

  it("lists each rule version once and keeps notices", () => {
    const result = calculateTaxAmount({
      tax: "ICMS",
      base: dec("10"),
      rate: dec("18"),
      rules: [rule, rule],
      notices: ["ICMS-ST não incluído"],
    })
    expect(result.ruleVersions).toEqual(["test.rate@2020-01-01"])
    expect(result.notices).toEqual(["ICMS-ST não incluído"])
  })
})

describe("totalAmount", () => {
  it("sums the published amounts of each tax", () => {
    const parts = ["0.125", "0.135", "0.145"].map((base) =>
      calculateTaxAmount({ tax: "PIS", base: dec(base).times(100), rate: dec("1"), rules: [] }),
    )
    // published parts: 0.12 + 0.14 + 0.14 (12.50, 13.50 and 14.50 at 1%)
    expect(parts.map((p) => format(p.amount, 2))).toEqual(["0.12", "0.14", "0.14"])
    expect(format(totalAmount(parts), 2)).toBe("0.40")
  })
})

import { describe, expect, it } from "vitest"
import {
  ISS_MAX_RATE,
  ISS_MIN_RATE,
  ISS_NOTICES,
  IssRateOutOfRangeError,
  NoRuleInForceError,
  calculateIss,
  dec,
  format,
} from "../src/index.js"

// Fictional services and amounts; only the rate limits come from the law.
describe("calculateIss", () => {
  it("accepts the minimum rate (2%)", () => {
    const result = calculateIss({ date: "2026-03-10", base: dec("1000"), rate: "2" })
    expect(result.tax).toBe("ISS")
    expect(format(result.rate, 4)).toBe("2.0000")
    expect(format(result.amount, 2)).toBe("20.00")
  })

  it("accepts the maximum rate (5%)", () => {
    const result = calculateIss({ date: "2026-03-10", base: dec("1000"), rate: dec("5") })
    expect(format(result.amount, 2)).toBe("50.00")
  })

  it("applies a rate inside the limits (3.5%)", () => {
    const result = calculateIss({ date: "2026-03-10", base: dec("2500.40"), rate: "3.5" })
    expect(format(result.base, 2)).toBe("2500.40")
    expect(format(result.amount, 2)).toBe("87.51") // 87.514
  })

  it("rounds the amount half-even", () => {
    // 100.25 × 2% = 2.005 → 2.00; 100.75 × 2% = 2.015 → 2.02 (ties go to the even digit)
    expect(
      format(calculateIss({ date: "2026-03-10", base: dec("100.25"), rate: "2" }).amount, 2),
    ).toBe("2.00")
    expect(
      format(calculateIss({ date: "2026-03-10", base: dec("100.75"), rate: "2" }).amount, 2),
    ).toBe("2.02")
  })

  it("records the rule versions, legal sources and scope notices", () => {
    const result = calculateIss({ date: "2026-03-10", base: dec("100"), rate: "3" })
    expect(result.ruleVersions).toEqual(["iss.min-rate@2017-12-30", "iss.max-rate@2003-08-01"])
    expect(result.sources.map((s) => `${s.norm}, ${s.provision}`)).toEqual([
      "LC 116/2003, art. 8º-A, caput (incluído pela LC 157/2016)",
      "LC 116/2003, art. 8º, II",
    ])
    expect(result.notices).toEqual([...ISS_NOTICES])
  })

  it.each([
    ["below the minimum", "1.99"],
    ["above the maximum", "5.01"],
    ["zero", "0"],
  ])("rejects a rate %s with a clear message", (_label, rate) => {
    const call = () => calculateIss({ date: "2026-03-10", base: dec("100"), rate })
    expect(call).toThrow(IssRateOutOfRangeError)
    expect(call).toThrow("Alíquota de ISS deve estar entre 2% e 5%")
  })

  it("checks the informed rate before rounding it", () => {
    // 1.99999 would publish as 2.0000, but the informed rate is below the minimum.
    expect(() => calculateIss({ date: "2026-03-10", base: dec("100"), rate: "1.99999" })).toThrow(
      IssRateOutOfRangeError,
    )
  })

  it("exposes the limits on the error", () => {
    try {
      calculateIss({ date: "2026-03-10", base: dec("100"), rate: "6.5" })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(IssRateOutOfRangeError)
      const e = error as IssRateOutOfRangeError
      expect([e.min, e.max, e.rate].map((d) => d.toString())).toEqual(["2", "5", "6.5"])
      expect(e.message).toBe("Alíquota de ISS deve estar entre 2% e 5% (informada: 6,5%).")
    }
  })

  it("uses the constitutional minimum before LC 157/2016 took effect", () => {
    const result = calculateIss({ date: "2017-12-29", base: dec("100"), rate: "2" })
    expect(result.ruleVersions[0]).toBe("iss.min-rate@2002-06-13")
    expect(result.sources[0]?.norm).toBe("ADCT (EC 37/2002)")
    expect(() => calculateIss({ date: "2017-12-29", base: dec("100"), rate: "1.5" })).toThrow(
      IssRateOutOfRangeError,
    )
  })

  it("has no rule before LC 116/2003 was published", () => {
    expect(() => calculateIss({ date: "2003-07-31", base: dec("100"), rate: "3" })).toThrow(
      NoRuleInForceError,
    )
  })
})

describe("ISS rate tables", () => {
  it("cite planalto.gov.br for every version", () => {
    for (const table of [ISS_MIN_RATE, ISS_MAX_RATE]) {
      for (const version of table.versions) {
        expect(version.source.url).toMatch(/^https:\/\/www\.planalto\.gov\.br\//)
      }
    }
  })
})

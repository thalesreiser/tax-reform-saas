import { describe, expect, it } from "vitest"
import { dec, format, percentOf, sum, toAmount, toRate } from "../src/index.js"

describe("dec", () => {
  it("parses plain decimal text exactly", () => {
    expect(dec("0.1").plus(dec("0.2")).equals(dec("0.3"))).toBe(true)
    expect(format(dec("-12.5"), 2)).toBe("-12.50")
  })

  it.each(["", "1e3", "1,50", " 1", "abc", ".5", "NaN", "Infinity"])("rejects %j", (text) => {
    expect(() => dec(text)).toThrow(TypeError)
  })
})

describe("publication rounding (HALF_EVEN)", () => {
  it.each([
    ["0.125", "0.12"],
    ["0.135", "0.14"],
    ["2.675", "2.68"],
    ["-0.125", "-0.12"],
    ["10.005", "10.00"],
    ["10.0051", "10.01"],
  ])("amount %s → %s", (raw, published) => {
    expect(format(toAmount(dec(raw)), 2)).toBe(published)
  })

  it.each([
    ["3.52005", "3.5200"],
    ["3.52015", "3.5202"],
    ["0.123456", "0.1235"],
  ])("rate %s → %s", (raw, published) => {
    expect(format(toRate(dec(raw)), 4)).toBe(published)
  })
})

describe("exact arithmetic", () => {
  it("keeps percentOf exact until publication", () => {
    expect(percentOf(dec("1200.00"), dec("3.52")).toString()).toBe("42.24")
    expect(percentOf(dec("0.01"), dec("0.0001")).toString()).toBe("0.00000001")
  })

  it("sums without floating point drift", () => {
    const tenCents = Array.from({ length: 1000 }, () => dec("0.10"))
    expect(format(sum(tenCents), 2)).toBe("100.00")
    expect(sum([]).isZero()).toBe(true)
  })
})

import { describe, expect, it } from "vitest"
import {
  NoRuleInForceError,
  PIS_COFINS_EXCESS_CREDIT_NOTICE,
  PIS_COFINS_NO_CREDIT_CUMULATIVE_NOTICE,
  PIS_COFINS_SCOPE_NOTICE,
  calculatePisCofins,
  dec,
  format,
  totalAmount,
  type PisCofinsInput,
  type PisCofinsTax,
} from "../src/index.js"

// Fictional cases computed by hand from the law; the accountant's golden cases arrive in MOT-02.7.
// Cumulative: PIS 0.65% (Lei 9.715/1998, art. 8º, I), Cofins 3% (Lei 9.718/1998, art. 8º).
// Non-cumulative: PIS 1.65% (Lei 10.637/2002, art. 2º), Cofins 7.6% (Lei 10.833/2003, art. 2º);
// credits on purchases at the same rate (art. 3º, § 1º of both laws).

const DATE = "2026-03-15"

function run(
  input: Omit<PisCofinsInput, "revenue" | "creditablePurchases"> & {
    revenue: string
    creditablePurchases?: string
  },
) {
  const { revenue, creditablePurchases, ...rest } = input
  return calculatePisCofins({
    ...rest,
    revenue: dec(revenue),
    ...(creditablePurchases === undefined ? {} : { creditablePurchases: dec(creditablePurchases) }),
  })
}

function view(t: PisCofinsTax) {
  return {
    base: format(t.base, 2),
    rate: format(t.rate, 4),
    debit: format(t.debit, 2),
    creditBase: format(t.creditBase, 2),
    credit: format(t.credit, 2),
    amount: format(t.amount, 2),
    excessCredit: format(t.excessCredit, 2),
  }
}

describe("calculatePisCofins: cumulative regime", () => {
  it("applies 0.65% and 3% to gross revenue (100000.00 → 650.00 and 3000.00)", () => {
    const { pis, cofins } = run({ regime: "CUMULATIVE", date: DATE, revenue: "100000.00" })
    expect(view(pis)).toEqual({
      base: "100000.00",
      rate: "0.6500",
      debit: "650.00",
      creditBase: "0.00",
      credit: "0.00",
      amount: "650.00",
      excessCredit: "0.00",
    })
    expect(view(cofins)).toMatchObject({ rate: "3.0000", debit: "3000.00", amount: "3000.00" })
    expect(pis.tax).toBe("PIS")
    expect(cofins.tax).toBe("COFINS")
    expect(pis.ruleVersions).toEqual(["pis.cumulative.rate@1999-02-01"])
    expect(cofins.ruleVersions).toEqual(["cofins.cumulative.rate@1999-02-01"])
    expect(pis.sources[0]?.norm).toBe("Lei 9.715/1998")
    expect(cofins.sources[0]?.norm).toBe("Lei 9.718/1998")
    expect(pis.notices).toEqual([PIS_COFINS_SCOPE_NOTICE])
  })

  it("rounds each amount once (1234.56 → PIS 8.02464 → 8.02, Cofins 37.0368 → 37.04)", () => {
    const { pis, cofins } = run({ regime: "CUMULATIVE", date: DATE, revenue: "1234.56" })
    expect(format(pis.amount, 2)).toBe("8.02")
    expect(format(cofins.amount, 2)).toBe("37.04")
  })

  it.each([
    // 10.00 × 0.65% = 0.065 → 0.06 (tie, 6 is even); 10.00 × 3% = 0.30
    ["10.00", "0.06", "0.30"],
    // 30.00 × 0.65% = 0.195 → 0.20 (tie, 9 is odd); 30.00 × 3% = 0.90
    ["30.00", "0.20", "0.90"],
    // 1.50 × 0.65% = 0.00975 → 0.01; 1.50 × 3% = 0.045 → 0.04 (tie, 4 is even)
    ["1.50", "0.01", "0.04"],
  ])(
    "rounds ties half-even (revenue %s → PIS %s, Cofins %s)",
    (revenue, pisAmount, cofinsAmount) => {
      const { pis, cofins } = run({ regime: "CUMULATIVE", date: DATE, revenue })
      expect(format(pis.amount, 2)).toBe(pisAmount)
      expect(format(cofins.amount, 2)).toBe(cofinsAmount)
    },
  )

  it("publishes the base before multiplying (100.005 → 100.00 → PIS 0.65)", () => {
    const { pis } = run({ regime: "CUMULATIVE", date: DATE, revenue: "100.005" })
    expect(format(pis.base, 2)).toBe("100.00")
    expect(format(pis.amount, 2)).toBe("0.65")
  })

  it("ignores purchases, which give no credit in the cumulative regime, and says so", () => {
    const { pis, cofins } = run({
      regime: "CUMULATIVE",
      date: DATE,
      revenue: "1000.00",
      creditablePurchases: "400.00",
    })
    expect(view(pis)).toMatchObject({ creditBase: "0.00", credit: "0.00", amount: "6.50" })
    expect(format(cofins.amount, 2)).toBe("30.00")
    expect(pis.notices).toContain(PIS_COFINS_NO_CREDIT_CUMULATIVE_NOTICE)
    expect(cofins.notices).toContain(PIS_COFINS_NO_CREDIT_CUMULATIVE_NOTICE)
  })
})

describe("calculatePisCofins: non-cumulative regime", () => {
  it("nets credits on purchases against the debit (100000.00 sales, 40000.00 purchases)", () => {
    const { pis, cofins } = run({
      regime: "NON_CUMULATIVE",
      date: DATE,
      revenue: "100000.00",
      creditablePurchases: "40000.00",
    })
    // PIS: 1650.00 − 660.00 = 990.00; Cofins: 7600.00 − 3040.00 = 4560.00
    expect(view(pis)).toEqual({
      base: "100000.00",
      rate: "1.6500",
      debit: "1650.00",
      creditBase: "40000.00",
      credit: "660.00",
      amount: "990.00",
      excessCredit: "0.00",
    })
    expect(view(cofins)).toMatchObject({
      rate: "7.6000",
      debit: "7600.00",
      credit: "3040.00",
      amount: "4560.00",
    })
    expect(pis.ruleVersions).toEqual(["pis.non-cumulative.rate@2002-12-01"])
    expect(cofins.ruleVersions).toEqual(["cofins.non-cumulative.rate@2004-02-01"])
    expect(format(totalAmount([pis, cofins]), 2)).toBe("5550.00")
    expect(pis.notices).toEqual([PIS_COFINS_SCOPE_NOTICE])
  })

  it("rounds debit and credit separately, then subtracts the published amounts", () => {
    // PIS: 10.30 × 1.65% = 0.16995 → 0.17; 10.00 × 1.65% = 0.165 → 0.16 (tie, even) → net 0.01.
    // Netting the bases first would give 0.30 × 1.65% = 0.00495 → 0.00, which is not the rule.
    // Cofins: 10.30 × 7.6% = 0.7828 → 0.78; 10.00 × 7.6% = 0.76 → net 0.02.
    const { pis, cofins } = run({
      regime: "NON_CUMULATIVE",
      date: DATE,
      revenue: "10.30",
      creditablePurchases: "10.00",
    })
    expect(view(pis)).toMatchObject({ debit: "0.17", credit: "0.16", amount: "0.01" })
    expect(view(cofins)).toMatchObject({ debit: "0.78", credit: "0.76", amount: "0.02" })
  })

  it("never goes negative: excess credit carries forward with a notice", () => {
    // PIS: 1000.00 × 1.65% = 16.50; 1500.00 × 1.65% = 24.75 → 0.00 due, 8.25 carried forward.
    // Cofins: 76.00 − 114.00 → 0.00 due, 38.00 carried forward.
    const { pis, cofins } = run({
      regime: "NON_CUMULATIVE",
      date: DATE,
      revenue: "1000.00",
      creditablePurchases: "1500.00",
    })
    expect(view(pis)).toMatchObject({
      debit: "16.50",
      credit: "24.75",
      amount: "0.00",
      excessCredit: "8.25",
    })
    expect(view(cofins)).toMatchObject({
      debit: "76.00",
      credit: "114.00",
      amount: "0.00",
      excessCredit: "38.00",
    })
    expect(pis.notices).toContain(PIS_COFINS_EXCESS_CREDIT_NOTICE)
    expect(cofins.notices).toContain(PIS_COFINS_EXCESS_CREDIT_NOTICE)
  })

  it("treats missing purchases as no credit", () => {
    const { pis } = run({ regime: "NON_CUMULATIVE", date: DATE, revenue: "200.00" })
    expect(view(pis)).toMatchObject({ debit: "3.30", credit: "0.00", amount: "3.30" })
  })
})

describe("calculatePisCofins: validity and input checks", () => {
  it.each([
    ["CUMULATIVE", "1999-01-31"],
    ["NON_CUMULATIVE", "2002-11-30"],
    // PIS non-cumulative is in force, Cofins non-cumulative only from 2004-02-01.
    ["NON_CUMULATIVE", "2004-01-31"],
  ] as const)("has no rule for %s on %s", (regime, date) => {
    expect(() => run({ regime, date, revenue: "100.00" })).toThrow(NoRuleInForceError)
  })

  it.each([
    ["CUMULATIVE", "1999-02-01"],
    ["NON_CUMULATIVE", "2004-02-01"],
  ] as const)("resolves %s on its first day, %s", (regime, date) => {
    expect(() => run({ regime, date, revenue: "100.00" })).not.toThrow()
  })

  it.each([
    ["-0.01", undefined],
    ["100.00", "-1.00"],
  ] as const)(
    "rejects negative bases (revenue %s, purchases %s)",
    (revenue, creditablePurchases) => {
      expect(() =>
        run({
          regime: "NON_CUMULATIVE",
          date: DATE,
          revenue,
          ...(creditablePurchases === undefined ? {} : { creditablePurchases }),
        }),
      ).toThrow(RangeError)
    },
  )
})

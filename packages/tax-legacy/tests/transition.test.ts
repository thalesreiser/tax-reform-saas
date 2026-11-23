import { TRANSITION_YEARS } from "@trs/shared-types"
import { describe, expect, it } from "vitest"
import {
  NoRuleInForceError,
  TRANSITION_TABLES,
  format,
  resolveRule,
  transitionRules,
  type TransitionRules,
} from "../src/index.js"

// Expected values, year by year, as read from EC 132/2023 (ADCT arts. 125-129) and LC 214/2025.
// prettier-ignore
const EXPECTED = {
  //     PIS/Cofins  IPI zero + ZFM  ICMS/ISS factor  CBS mode     CBS rate  CBS adj.  IBS mode     IBS UF  IBS mun.
  2026: [true,       false,          "1.0",           "STATUTORY", "0.9",    null,     "STATUTORY", "0.1",  "0"],
  2027: [false,      true,           "1.0",           "REFERENCE", null,     "-0.1",   "STATUTORY", "0.05", "0.05"],
  2028: [false,      true,           "1.0",           "REFERENCE", null,     "-0.1",   "STATUTORY", "0.05", "0.05"],
  2029: [false,      true,           "0.9",           "REFERENCE", null,     "0",      "REFERENCE", null,   null],
  2030: [false,      true,           "0.8",           "REFERENCE", null,     "0",      "REFERENCE", null,   null],
  2031: [false,      true,           "0.7",           "REFERENCE", null,     "0",      "REFERENCE", null,   null],
  2032: [false,      true,           "0.6",           "REFERENCE", null,     "0",      "REFERENCE", null,   null],
  2033: [false,      true,           "0.0",           "REFERENCE", null,     "0",      "REFERENCE", null,   null],
} as const

const rulesOf = (year: number): TransitionRules => transitionRules(year)
const years = TRANSITION_YEARS.map((year) => [year] as const)

describe("transitionRules: year by year", () => {
  it.each(years)("%d: PIS and Cofins in force", (year) => {
    const [inForce] = EXPECTED[year]
    expect(rulesOf(year).pis.value.inForce).toBe(inForce)
    expect(rulesOf(year).cofins.value.inForce).toBe(inForce)
  })

  it.each(years)("%d: IPI zero-rated except Zona Franca de Manaus", (year) => {
    const [, zeroed] = EXPECTED[year]
    const { ipi } = rulesOf(year)
    expect(ipi.value.inForce).toBe(true)
    expect(ipi.value.zeroRated).toBe(zeroed)
    expect(ipi.value.zonaFrancaException).toBe(zeroed)
  })

  it.each(years)("%d: ICMS and ISS rate factor", (year) => {
    const [, , factor] = EXPECTED[year]
    const { icms, iss } = rulesOf(year)
    expect(format(icms.value.rateFactor, 1)).toBe(factor)
    expect(format(iss.value.rateFactor, 1)).toBe(factor)
    expect(icms.value.inForce).toBe(year < 2033)
    expect(iss.value.inForce).toBe(year < 2033)
  })

  it.each(years)("%d: ICMS and ISS reduced rates are those in force on 2028-12-31", (year) => {
    const { icms, iss } = rulesOf(year)
    const expected = year >= 2029 && year <= 2032 ? "2028-12-31" : null
    expect(icms.value.baseRatesAsOf).toBe(expected)
    expect(iss.value.baseRatesAsOf).toBe(expected)
  })

  it.each(years)("%d: CBS regime", (year) => {
    const [, , , mode, rate, adjustment] = EXPECTED[year]
    const cbs = rulesOf(year).cbs.value
    expect(cbs.mode).toBe(mode)
    if (cbs.mode === "STATUTORY") {
      expect(cbs.provisional).toBe(false)
      expect(format(cbs.rate, 1)).toBe(rate)
    } else {
      expect(cbs.provisional).toBe(true)
      expect(cbs.adjustmentPercentagePoints.toString()).toBe(adjustment)
    }
  })

  it.each(years)("%d: IBS regime", (year) => {
    const [, , , , , , mode, stateRate, municipalRate] = EXPECTED[year]
    const ibs = rulesOf(year).ibs.value
    expect(ibs.mode).toBe(mode)
    if (ibs.mode === "STATUTORY") {
      expect(ibs.provisional).toBe(false)
      expect(ibs.stateRate.toString()).toBe(stateRate)
      expect(ibs.municipalRate.toString()).toBe(municipalRate)
    } else {
      expect(ibs.provisional).toBe(true)
    }
  })

  it.each(years)("%d: 2026 test-year rules only in 2026", (year) => {
    const { cbs, ibs } = rulesOf(year)
    if (year === 2026) {
      const testYear = {
        offsetAgainstPisCofins: true,
        paymentWaivedIfObligationsMet: true,
        appliesToSimplesNacional: false,
      }
      expect(cbs.value.mode === "STATUTORY" && cbs.value.testYear).toEqual(testYear)
      expect(ibs.value.mode === "STATUTORY" && ibs.value.testYear).toEqual(testYear)
    } else if (ibs.value.mode === "STATUTORY") {
      expect(ibs.value.testYear).toBeNull()
    }
  })

  it.each(years)("%d: every rule carries a planalto.gov.br source and a version id", (year) => {
    const rules = rulesOf(year)
    const resolved = [
      rules.pis,
      rules.cofins,
      rules.ipi,
      rules.icms,
      rules.iss,
      rules.cbs,
      rules.ibs,
    ]
    for (const rule of resolved) {
      expect(rule.source.norm).toMatch(/^(LC 214\/2025|EC 132\/2023)/)
      expect(rule.source.provision).toMatch(/^art/)
      expect(rule.source.url).toMatch(/^https:\/\/www\.planalto\.gov\.br\/ccivil_03\//)
      expect(rule.versionId).toMatch(/^transition\.[a-z-]+@\d{4}-\d{2}-\d{2}$/)
    }
    expect(rules.ruleVersions).toEqual([...new Set(resolved.map((r) => r.versionId))])
    expect(rules.year).toBe(year)
  })
})

describe("transitionRules: sources", () => {
  it("cites the provisions that fix each number", () => {
    const r2026 = rulesOf(2026)
    expect(r2026.cbs.source.provision).toContain("art. 346")
    expect(r2026.ibs.source.provision).toContain("art. 343")
    const r2027 = rulesOf(2027)
    expect(r2027.cbs.source.provision).toContain("art. 347")
    expect(r2027.ibs.source.provision).toContain("art. 344")
    expect(r2027.pis.source.provision).toContain("art. 542")
    expect(r2027.ipi.source.provision).toContain("art. 454")
    expect(rulesOf(2029).icms.source.provision).toContain("art. 501")
    expect(rulesOf(2029).iss.source.provision).toContain("art. 508")
    expect(rulesOf(2033).icms.source.provision).toContain("art. 543")
    expect(rulesOf(2033).ibs.source.provision).toContain("art. 365")
  })

  it("marks reference rates as set by Senate resolution", () => {
    for (const year of TRANSITION_YEARS.filter((y) => y >= 2027)) {
      expect(rulesOf(year).cbs.source.provision).toMatch(/art\. 349/)
    }
    for (const year of TRANSITION_YEARS.filter((y) => y >= 2029)) {
      expect(rulesOf(year).ibs.source.provision).toMatch(/art\. 349/)
    }
  })
})

describe("transitionRules: boundaries", () => {
  it("switches from the 2026 to the 2027 rules at midnight of 1 January", () => {
    const last2026 = transitionRules("2026-12-31")
    const first2027 = transitionRules("2027-01-01")
    expect(last2026.year).toBe(2026)
    expect(first2027.year).toBe(2027)
    expect(last2026.pis.value.inForce).toBe(true)
    expect(first2027.pis.value.inForce).toBe(false)
    expect(last2026.cbs.value.mode).toBe("STATUTORY")
    expect(first2027.cbs.value.mode).toBe("REFERENCE")
    expect(last2026.ibs.versionId).toBe("transition.ibs@2026-01-01")
    expect(first2027.ibs.versionId).toBe("transition.ibs@2027-01-01")
  })

  it.each([
    ["2028-12-31", "1.0"],
    ["2029-01-01", "0.9"],
    ["2032-12-31", "0.6"],
    ["2033-01-01", "0.0"],
  ])("ICMS factor on %s is %s", (date, factor) => {
    expect(format(transitionRules(date).icms.value.rateFactor, 1)).toBe(factor)
  })

  it("returns the same rules for a year and for any date in it", () => {
    expect(transitionRules("2030-07-15")).toEqual({ ...transitionRules(2030), date: "2030-07-15" })
    expect(transitionRules(2030).date).toBe("2030-01-01")
  })

  it.each([2025, 2034, 2026.5, Number.NaN])("rejects year %d", (year) => {
    expect(() => transitionRules(year)).toThrow(RangeError)
  })

  it.each(["2025-12-31", "2034-01-01"])("rejects date %s outside the transition", (date) => {
    expect(() => transitionRules(date)).toThrow(RangeError)
  })

  it.each(["2027-02-30", "2027", "01/01/2027", ""])("rejects invalid date %j", (date) => {
    expect(() => transitionRules(date)).toThrow(RangeError)
  })
})

describe("transition tables", () => {
  it("cover exactly 2026-01-01 to 2033-12-31 with no gaps", () => {
    for (const table of TRANSITION_TABLES) {
      expect(table.versions[0]?.validFrom).toBe("2026-01-01")
      expect(table.versions.at(-1)?.validTo).toBe("2033-12-31")
      expect(() => resolveRule(table, "2025-12-31")).toThrow(NoRuleInForceError)
      expect(() => resolveRule(table, "2034-01-01")).toThrow(NoRuleInForceError)
      table.versions.slice(1).forEach((v, i) => {
        const previousEnd = new Date(`${table.versions[i]?.validTo ?? ""}T00:00:00Z`)
        previousEnd.setUTCDate(previousEnd.getUTCDate() + 1)
        expect(v.validFrom).toBe(previousEnd.toISOString().slice(0, 10))
      })
    }
  })
})

import { describe, expect, it } from "vitest"
import {
  NoRuleInForceError,
  RuleTableError,
  defineRuleTable,
  isIsoDate,
  resolveRule,
  type RuleVersion,
} from "../src/index.js"

// Fictional rules: the real tables arrive with MOT-02.2 to MOT-02.5.
const source = { norm: "Lei Fictícia 1/2020", provision: "art. 1º" }
const v = (validFrom: string, validTo: string | undefined, value: string): RuleVersion<string> => ({
  validFrom,
  ...(validTo === undefined ? {} : { validTo }),
  source,
  value,
})

describe("isIsoDate", () => {
  it.each(["2026-01-01", "2028-02-29"])("accepts %s", (d) => expect(isIsoDate(d)).toBe(true))
  it.each(["2026-02-30", "2027-02-29", "2026-1-01", "01/01/2026", "2026-13-01", ""])(
    "rejects %j",
    (d) => expect(isIsoDate(d)).toBe(false),
  )
})

describe("defineRuleTable", () => {
  it("accepts consecutive versions and freezes the table", () => {
    const table = defineRuleTable("test.rate", [
      v("2020-01-01", "2025-12-31", "A"),
      v("2026-01-01", undefined, "B"),
    ])
    expect(Object.isFrozen(table)).toBe(true)
    expect(Object.isFrozen(table.versions)).toBe(true)
  })

  it.each([
    ["no versions", []],
    ["invalid validFrom", [v("2026-02-30", undefined, "A")]],
    ["validTo before validFrom", [v("2026-01-02", "2026-01-01", "A")]],
    [
      "open-ended version before the last",
      [v("2020-01-01", undefined, "A"), v("2026-01-01", undefined, "B")],
    ],
    [
      "versions out of order",
      [v("2026-01-01", "2026-12-31", "A"), v("2020-01-01", undefined, "B")],
    ],
    ["overlap", [v("2020-01-01", "2026-01-01", "A"), v("2026-01-01", undefined, "B")]],
  ])("rejects %s", (_label, versions) => {
    expect(() => defineRuleTable("test.rate", versions)).toThrow(RuleTableError)
  })

  it("rejects a version without a legal source", () => {
    const noSource = { ...v("2020-01-01", undefined, "A"), source: { norm: " " } }
    expect(() => defineRuleTable("test.rate", [noSource])).toThrow(/legal source/)
  })

  it("rejects an empty id", () => {
    expect(() => defineRuleTable(" ", [v("2020-01-01", undefined, "A")])).toThrow(RuleTableError)
  })
})

describe("resolveRule", () => {
  const table = defineRuleTable("test.rate", [
    v("2020-01-01", "2023-12-31", "A"),
    // gap: 2024
    v("2025-01-01", "2026-06-30", "B"),
    v("2026-07-01", undefined, "C"),
  ])

  it.each([
    ["2020-01-01", "A", "test.rate@2020-01-01"],
    ["2023-12-31", "A", "test.rate@2020-01-01"],
    ["2025-01-01", "B", "test.rate@2025-01-01"],
    ["2026-06-30", "B", "test.rate@2025-01-01"],
    ["2026-07-01", "C", "test.rate@2026-07-01"],
    ["2033-12-31", "C", "test.rate@2026-07-01"],
  ])("on %s returns %s", (date, value, versionId) => {
    const rule = resolveRule(table, date)
    expect(rule.value).toBe(value)
    expect(rule.versionId).toBe(versionId)
    expect(rule.source).toEqual(source)
  })

  it.each(["2019-12-31", "2024-06-15"])("has no rule on %s", (date) => {
    expect(() => resolveRule(table, date)).toThrow(NoRuleInForceError)
  })

  it("rejects an invalid date", () => {
    expect(() => resolveRule(table, "2026-02-30")).toThrow(RangeError)
  })
})

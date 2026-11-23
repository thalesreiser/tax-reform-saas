import { describe, expect, it } from "vitest"
import {
  FIRST_TRANSITION_YEAR,
  LAST_TRANSITION_YEAR,
  TRANSITION_YEARS,
  isTransitionYear,
} from "../src/index.js"

describe("transition years", () => {
  it("covers 2026 to 2033 in order, with no gaps", () => {
    expect(TRANSITION_YEARS).toEqual([2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033])
    expect(FIRST_TRANSITION_YEAR).toBe(2026)
    expect(LAST_TRANSITION_YEAR).toBe(2033)
  })

  it.each([2026, 2029, 2033])("accepts %d", (year) => {
    expect(isTransitionYear(year)).toBe(true)
  })

  it.each([2025, 2034, 2026.5, Number.NaN])("rejects %d", (year) => {
    expect(isTransitionYear(year)).toBe(false)
  })
})

import { describe, expect, it } from "vitest"
import {
  emptyDashboard,
  formatPoints,
  impactTone,
  NAV_ITEMS,
  nextStep,
  onboardingSteps,
} from "../../app/utils/dashboard"

describe("dashboard view model", () => {
  it("gives a new office no numbers and every onboarding step pending", () => {
    const view = emptyDashboard()
    expect(Object.values(view.kpis)).toEqual([null, null, null])
    expect(view.portfolio).toEqual([])
    expect(view.recentSimulations).toEqual([])
    const steps = onboardingSteps(view)
    expect(steps.map((s) => s.id)).toEqual(["client", "profile", "simulation", "team"])
    expect(steps.every((s) => !s.done)).toBe(true)
    expect(steps.map((s) => s.to)).toEqual(["/clientes/novo", null, null, null])
    expect(nextStep(steps)?.id).toBe("client")
  })

  it("moves the next step forward as the office progresses", () => {
    const view = emptyDashboard()
    view.progress = { clients: 2, clientsWithProfile: 1, simulations: 0, members: 1 }
    expect(nextStep(onboardingSteps(view))?.id).toBe("simulation")
    view.progress = { clients: 2, clientsWithProfile: 2, simulations: 3, members: 2 }
    expect(nextStep(onboardingSteps(view))).toBeUndefined()
  })

  it("links only the pages that exist", () => {
    expect(NAV_ITEMS.filter((i) => i.to !== null).map((i) => i.id)).toEqual([
      "dashboard",
      "clients",
    ])
  })

  it.each([
    ["-2.10", "−2,10 p.p.", "gain"],
    ["0.75", "+0,75 p.p.", "increase"],
    ["+3", "+3 p.p.", "increase"],
    ["0.00", "0,00 p.p.", "neutral"],
    ["-0", "0 p.p.", "neutral"],
  ])("formats %s as %s (%s)", (value, text, tone) => {
    expect(formatPoints(value)).toBe(text)
    expect(impactTone(value)).toBe(tone)
  })

  it("rejects values that are not decimal strings", () => {
    expect(() => formatPoints("1e3")).toThrow()
    expect(() => impactTone("")).toThrow()
  })
})

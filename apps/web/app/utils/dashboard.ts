// View model of the dashboard home (FE-02.1). Plain module (no Nuxt imports), so the unit tests
// exercise it directly. Components only receive these shapes, so a populated dashboard is a prop
// change: the data arrives with BE-02.2 (clients), BE-02.4 (simulations) and BE-03.2 (API usage).

/** Signed-in navigation. `to: null` marks a page that does not exist yet ("Em breve"). */
export const NAV_ITEMS = [
  { id: "dashboard", icon: "i-lucide-layout-dashboard", to: "/painel" },
  { id: "clients", icon: "i-lucide-building-2", to: null },
  { id: "simulations", icon: "i-lucide-chart-column", to: null },
  { id: "apiKeys", icon: "i-lucide-key-round", to: null },
  { id: "office", icon: "i-lucide-settings", to: null },
] as const satisfies readonly { id: string; icon: string; to: string | null }[]

export type NavItem = (typeof NAV_ITEMS)[number]

export type Regime = "simples" | "presumido" | "real"

/** Change of the tax burden on revenue in 2033, in percentage points (decimal string, e.g. "-2.10"). */
export type Points = string

export interface PortfolioRow {
  clientId: string
  clientName: string
  regime: Regime
  impact2033: Points
}

export interface RecentSimulation {
  id: string
  clientName: string
  /** ISO 8601 timestamp. */
  createdAt: string
  impact2033: Points
}

export interface DashboardView {
  /** `null`: no data source yet, shown as an empty tile (never a sample number). */
  kpis: { clients: number | null; simulations: number | null; apiCalls: number | null }
  progress: { clients: number; clientsWithProfile: number; simulations: number; members: number }
  /** Ranked by the API (largest impact first). */
  portfolio: PortfolioRow[]
  recentSimulations: RecentSimulation[]
}

export type OnboardingStepId = "client" | "profile" | "simulation" | "team"

export interface OnboardingStep {
  id: OnboardingStepId
  done: boolean
  /** Page that completes the step; `null` until that page exists. */
  to: string | null
}

/** What a new office sees: every list empty and no numbers. */
export function emptyDashboard(): DashboardView {
  return {
    kpis: { clients: null, simulations: null, apiCalls: null },
    progress: { clients: 0, clientsWithProfile: 0, simulations: 0, members: 1 },
    portfolio: [],
    recentSimulations: [],
  }
}

export function onboardingSteps(view: DashboardView): OnboardingStep[] {
  const { clients, clientsWithProfile, simulations, members } = view.progress
  return [
    { id: "client", done: clients > 0, to: null },
    { id: "profile", done: clientsWithProfile > 0, to: null },
    { id: "simulation", done: simulations > 0, to: null },
    { id: "team", done: members > 1, to: null },
  ]
}

/** The first pending step, highlighted as the next action; `undefined` when all are done. */
export function nextStep(steps: OnboardingStep[]): OnboardingStep | undefined {
  return steps.find((s) => !s.done)
}

export type ImpactTone = "gain" | "increase" | "neutral"

const POINTS = /^([+-]?)(\d+)(?:\.(\d+))?$/

/** Lower burden is a gain for the client. String-only: rates never go through `number`. */
export function impactTone(value: Points): ImpactTone {
  const m = POINTS.exec(value)
  if (!m) throw new Error(`invalid points value: ${value}`)
  if (/^0+$/.test(m[2] ?? "") && /^0*$/.test(m[3] ?? "")) return "neutral"
  return m[1] === "-" ? "gain" : "increase"
}

/** "-2.1" -> "−2,1 p.p."; "0.75" -> "+0,75 p.p." (pt-BR decimal comma, typographic minus). */
export function formatPoints(value: Points): string {
  const m = POINTS.exec(value)
  if (!m) throw new Error(`invalid points value: ${value}`)
  const tone = impactTone(value)
  const sign = tone === "gain" ? "\u2212" : tone === "increase" ? "+" : ""
  return `${sign}${m[2] ?? ""}${m[3] ? `,${m[3]}` : ""} p.p.`
}

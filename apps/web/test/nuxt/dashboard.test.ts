// Dashboard components in the Nuxt runtime: the populated state is only a prop change.
import { mountSuspended } from "@nuxt/test-utils/runtime"
import { describe, expect, it } from "vitest"
import DashboardKpis from "../../app/components/dashboard/Kpis.vue"
import DashboardOnboarding from "../../app/components/dashboard/Onboarding.vue"
import DashboardPortfolio from "../../app/components/dashboard/Portfolio.vue"
import DashboardRecentSimulations from "../../app/components/dashboard/RecentSimulations.vue"
import { emptyDashboard, onboardingSteps } from "../../app/utils/dashboard"
import { populatedDashboard } from "./fixtures/dashboard"

describe("dashboard components", () => {
  it("ranks the portfolio in a captioned table with row headers and spelled-out tones", async () => {
    const wrapper = await mountSuspended(DashboardPortfolio, {
      props: { rows: populatedDashboard.portfolio },
    })
    const table = wrapper.find("table")
    expect(table.find("caption").text()).toBe("Clientes ordenados pelo impacto da reforma em 2033")
    expect(table.findAll("thead th").every((th) => th.attributes("scope") === "col")).toBe(true)
    const rows = table.findAll("tbody tr")
    expect(rows.map((r) => r.find("th[scope=row]").text())).toEqual([
      "Padaria Exemplo Ltda",
      "Oficina Fictícia ME",
      "Loja Teste S.A.",
    ])
    expect(rows[0]?.text()).toContain("Simples Nacional")
    expect(rows[0]?.find(".pill-gain").text()).toContain("−2,10 p.p.")
    expect(rows[0]?.text()).toContain("redução da carga")
    expect(rows[1]?.find(".pill-increase").text()).toContain("+1,35 p.p.")
    expect(rows[2]?.text()).toContain("sem variação")
    expect(wrapper.text()).toContain("Estimativas com alíquotas de referência provisórias.")
  })

  it("shows the portfolio and recent simulations empty states without a table", async () => {
    const portfolio = await mountSuspended(DashboardPortfolio, { props: { rows: [] } })
    expect(portfolio.find("table").exists()).toBe(false)
    expect(portfolio.text()).toContain("ordenados pelo impacto da reforma em 2033")
    const recent = await mountSuspended(DashboardRecentSimulations, { props: { rows: [] } })
    expect(recent.find("table").exists()).toBe(false)
    expect(recent.text()).toContain("Nenhuma simulação ainda.")
  })

  it("lists recent simulations with a machine-readable date", async () => {
    const wrapper = await mountSuspended(DashboardRecentSimulations, {
      props: { rows: populatedDashboard.recentSimulations },
    })
    const time = wrapper.find("tbody time")
    expect(time.attributes("datetime")).toBe("2026-11-20T15:00:00Z")
    expect(time.text()).toBe("20/11/2026")
  })

  it("formats KPI numbers in pt-BR and keeps zero as a real value", async () => {
    const wrapper = await mountSuspended(DashboardKpis, {
      props: { kpis: populatedDashboard.kpis },
    })
    const values = wrapper.findAll("li").map((li) => li.findAll("p")[1]?.text())
    expect(values).toEqual(["1.280", "42", "0"])
    expect(wrapper.text()).not.toContain("Sem dados ainda")
  })

  it("highlights the next onboarding step and marks finished ones", async () => {
    const empty = await mountSuspended(DashboardOnboarding, {
      props: { steps: onboardingSteps(emptyDashboard()) },
    })
    const items = empty.findAll("li")
    expect(items[0]?.classes()).toContain("surface-brand")
    expect(items[0]?.attributes("aria-current")).toBe("step")
    expect(empty.findAll("[aria-disabled=true]")).toHaveLength(4)
    expect(empty.find("a").exists()).toBe(false)

    const view = emptyDashboard()
    view.progress.clients = 1
    const later = await mountSuspended(DashboardOnboarding, {
      props: { steps: onboardingSteps(view) },
    })
    expect(later.text()).toContain("1 de 4 concluídos")
    expect(later.findAll("li")[0]?.text()).toContain("(concluído)")
    expect(later.findAll("li")[1]?.attributes("aria-current")).toBe("step")
  })
})

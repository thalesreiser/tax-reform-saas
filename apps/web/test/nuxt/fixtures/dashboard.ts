import type { DashboardView } from "../../../app/utils/dashboard"

// Populated dashboard for component tests only. Fictional companies and values.
export const populatedDashboard: DashboardView = {
  kpis: { clients: 1280, simulations: 42, apiCalls: 0 },
  progress: { clients: 3, clientsWithProfile: 3, simulations: 5, members: 1 },
  portfolio: [
    {
      clientId: "c1",
      clientName: "Padaria Exemplo Ltda",
      regime: "simples",
      impact2033: "-2.10",
    },
    { clientId: "c2", clientName: "Oficina Fictícia ME", regime: "presumido", impact2033: "1.35" },
    { clientId: "c3", clientName: "Loja Teste S.A.", regime: "real", impact2033: "0.00" },
  ],
  recentSimulations: [
    {
      id: "s1",
      clientName: "Padaria Exemplo Ltda",
      createdAt: "2026-11-20T15:00:00Z",
      impact2033: "-2.10",
    },
  ],
}

import type { DashboardView } from "~/utils/dashboard"
import { emptyDashboard } from "~/utils/dashboard"

/**
 * Data of the dashboard home. Until the client, simulation and usage endpoints exist (BE-02.2,
 * BE-02.4, BE-03.2) it returns the empty state of a new office; then this fetches them and the
 * components stay as they are.
 */
export function useDashboard() {
  return useState<DashboardView>("dashboard", emptyDashboard)
}

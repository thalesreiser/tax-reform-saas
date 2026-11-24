<script setup lang="ts">
import type { PortfolioRow } from "~/utils/dashboard"

// Portfolio view: clients ranked by the impact of the reform in 2033 (order given by the API).
defineProps<{ rows: PortfolioRow[] }>()
const { t } = useI18n()
</script>

<template>
  <section aria-labelledby="portfolio-title" class="surface-glass motion-enter p-6">
    <h2 id="portfolio-title" class="text-lg font-semibold tracking-tight text-highlighted">
      {{ t("dashboard.portfolio.title") }}
    </h2>
    <p v-if="rows.length === 0" class="mt-2 text-muted">{{ t("dashboard.portfolio.empty") }}</p>
    <template v-else>
      <div class="mt-4 overflow-x-auto">
        <table class="w-full text-left text-sm">
          <caption class="sr-only">
            {{
              t("dashboard.portfolio.caption")
            }}
          </caption>
          <thead class="text-muted">
            <tr class="border-b border-default">
              <th scope="col" class="py-2 pr-4 font-medium">{{ t("dashboard.portfolio.rank") }}</th>
              <th scope="col" class="py-2 pr-4 font-medium">
                {{ t("dashboard.portfolio.client") }}
              </th>
              <th scope="col" class="py-2 pr-4 font-medium">
                {{ t("dashboard.portfolio.regime") }}
              </th>
              <th scope="col" class="py-2 text-right font-medium">
                {{ t("dashboard.portfolio.impact") }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in rows" :key="row.clientId" class="border-b border-default">
              <td class="py-2 pr-4 text-muted tabular-nums">{{ i + 1 }}</td>
              <th scope="row" class="py-2 pr-4 font-medium text-highlighted">
                {{ row.clientName }}
              </th>
              <td class="py-2 pr-4">{{ t(`dashboard.regimes.${row.regime}`) }}</td>
              <td class="py-2 text-right"><DashboardImpactPill :value="row.impact2033" /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-xs text-muted">{{ t("dashboard.estimate") }}</p>
    </template>
  </section>
</template>

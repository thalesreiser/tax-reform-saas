<script setup lang="ts">
import type { RecentSimulation } from "~/utils/dashboard"

defineProps<{ rows: RecentSimulation[] }>()
const { t } = useI18n()
const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" })
</script>

<template>
  <section aria-labelledby="recent-title" class="surface-glass motion-enter p-6">
    <h2 id="recent-title" class="text-lg font-semibold tracking-tight text-highlighted">
      {{ t("dashboard.recent.title") }}
    </h2>
    <p v-if="rows.length === 0" class="mt-2 text-muted">{{ t("dashboard.recent.empty") }}</p>
    <template v-else>
      <div class="mt-4 overflow-x-auto">
        <table class="w-full text-left text-sm">
          <caption class="sr-only">
            {{
              t("dashboard.recent.caption")
            }}
          </caption>
          <thead class="text-muted">
            <tr class="border-b border-default">
              <th scope="col" class="py-2 pr-4 font-medium">{{ t("dashboard.recent.client") }}</th>
              <th scope="col" class="py-2 pr-4 font-medium">{{ t("dashboard.recent.date") }}</th>
              <th scope="col" class="py-2 text-right font-medium">
                {{ t("dashboard.recent.impact") }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" class="border-b border-default">
              <th scope="row" class="py-2 pr-4 font-medium text-highlighted">
                {{ row.clientName }}
              </th>
              <td class="py-2 pr-4 tabular-nums">
                <time :datetime="row.createdAt">{{ date.format(new Date(row.createdAt)) }}</time>
              </td>
              <td class="py-2 text-right"><DashboardImpactPill :value="row.impact2033" /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-xs text-muted">{{ t("dashboard.estimate") }}</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import type { DashboardView } from "~/utils/dashboard"

// Office summary tiles. `null` is the empty state: a dash, spelled out for screen readers.
const props = defineProps<{ kpis: DashboardView["kpis"] }>()
const { t } = useI18n()
const format = new Intl.NumberFormat("pt-BR")
const tiles = computed(() =>
  (["clients", "simulations", "apiCalls"] as const).map((id) => ({ id, value: props.kpis[id] })),
)
</script>

<template>
  <ul :aria-label="t('dashboard.kpis.label')" class="grid gap-4 sm:grid-cols-3">
    <li v-for="tile in tiles" :key="tile.id" class="surface-glass motion-enter p-5">
      <p class="text-sm text-muted">{{ t(`dashboard.kpis.${tile.id}`) }}</p>
      <p class="mt-1 text-3xl font-semibold text-highlighted tabular-nums">
        <template v-if="tile.value !== null">{{ format.format(tile.value) }}</template>
        <template v-else>
          <span aria-hidden="true">—</span>
          <span class="sr-only">{{ t("dashboard.kpis.empty") }}</span>
        </template>
      </p>
      <p v-if="tile.value === null" class="mt-1 text-sm text-muted">
        {{ t(`dashboard.kpis.${tile.id}Hint`) }}
      </p>
    </li>
  </ul>
</template>

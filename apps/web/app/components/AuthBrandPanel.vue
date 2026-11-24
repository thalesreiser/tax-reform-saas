<script setup lang="ts">
// Brand side of the auth screens: value proposition plus an illustrative product preview with
// fictional data. White text only, on `bg-brand-strong` (AA along the whole gradient).
const { t } = useI18n()

// Fictional bar heights (plot units out of 80) for 2026-2033; the chart has a text alternative.
const bars = [
  [2026, 56, 56],
  [2027, 56, 52],
  [2028, 56, 51],
  [2029, 56, 48],
  [2030, 56, 44],
  [2031, 56, 40],
  [2032, 56, 35],
  [2033, 56, 28],
] as const
</script>

<template>
  <aside
    :aria-label="t('auth.brand.label')"
    class="surface-brand p-6 sm:p-8 lg:flex lg:flex-col lg:justify-between lg:p-10"
  >
    <div>
      <p class="text-sm font-medium">{{ t("auth.brand.eyebrow") }}</p>
      <p class="mt-2 text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
        {{ t("auth.brand.title") }}
      </p>
      <ul class="mt-6 hidden space-y-3 lg:block">
        <li v-for="n in 3" :key="n" class="flex gap-3">
          <UIcon name="i-lucide-check" class="mt-1 size-4 shrink-0" />
          <span>{{ t(`auth.brand.point${n}`) }}</span>
        </li>
      </ul>
    </div>

    <figure class="mt-10 hidden rounded-2xl border border-white/40 p-5 lg:block">
      <figcaption class="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span class="font-medium">{{ t("auth.brand.chartTitle") }}</span>
        <span aria-hidden="true" class="flex gap-4">
          <span class="inline-flex items-center gap-1.5">
            <span class="size-2.5 rounded-sm border-[1.5px] border-white" />
            {{ t("auth.brand.chartLegendCurrent") }}
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="size-2.5 rounded-sm bg-white" />
            {{ t("auth.brand.chartLegendReform") }}
          </span>
        </span>
      </figcaption>
      <svg
        viewBox="0 0 280 116"
        role="img"
        :aria-label="t('auth.brand.chartDescription')"
        class="mt-4 w-full tabular-nums"
      >
        <g v-for="([year, current, reform], i) in bars" :key="year">
          <rect
            :x="i * 35 + 6.75"
            :y="100 - current"
            width="10"
            :height="current"
            rx="1.5"
            fill="none"
            stroke="white"
            stroke-width="1.5"
          />
          <rect
            :x="i * 35 + 19"
            :y="100 - reform"
            width="10"
            :height="reform"
            rx="1.5"
            fill="white"
          />
          <text :x="i * 35 + 17.5" y="114" text-anchor="middle" font-size="10" fill="white">
            {{ year }}
          </text>
        </g>
      </svg>
      <div class="mt-5 flex items-end justify-between gap-4 border-t border-white/40 pt-4">
        <p>
          <span class="block text-3xl font-semibold tracking-tight tabular-nums">
            {{ t("auth.brand.kpi") }}
          </span>
          <span class="text-sm">{{ t("auth.brand.kpiLabel") }}</span>
        </p>
        <p class="text-right text-xs">{{ t("auth.brand.note") }}</p>
      </div>
    </figure>
  </aside>
</template>

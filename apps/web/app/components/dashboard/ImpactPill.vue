<script setup lang="ts">
import type { Points } from "~/utils/dashboard"
import { formatPoints, impactTone } from "~/utils/dashboard"

// Change of the burden in 2033: mint pill when it goes down, orange when it goes up. The tone is
// also spelled out for screen readers, so colour is never the only cue.
const props = defineProps<{ value: Points }>()
const { t } = useI18n()
const tone = computed(() => impactTone(props.value))
</script>

<template>
  <span
    class="inline-flex px-2.5 py-0.5 text-sm font-medium whitespace-nowrap tabular-nums"
    :class="{
      'pill-gain': tone === 'gain',
      'pill-increase': tone === 'increase',
      'text-default': tone === 'neutral',
    }"
  >
    {{ formatPoints(value) }}
    <span class="sr-only">({{ t(`dashboard.impact.${tone}`) }})</span>
  </span>
</template>

<script setup lang="ts">
// Provisional text wordmark until the product name (Q-01) and the logo are decided.
const { appName } = useAppConfig()
</script>

<template>
  <span class="inline-flex items-center gap-2.5">
    <span
      aria-hidden="true"
      class="grid size-8 place-items-center rounded-md bg-brand shadow-glass"
    >
      <span class="size-3 rounded-full bg-white/85" />
    </span>
    <span class="text-lg font-semibold tracking-tight text-highlighted">{{ appName }}</span>
  </span>
</template>

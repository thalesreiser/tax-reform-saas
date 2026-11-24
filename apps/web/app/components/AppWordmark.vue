<script setup lang="ts">
// Provisional text wordmark until the product name (Q-01) and the logo are decided.
// `collapse` keeps only the mark on phones (the header link still carries the name).
defineProps<{ collapse?: boolean }>()
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
    <span
      class="text-lg font-semibold tracking-tight text-highlighted"
      :class="{ 'max-sm:sr-only': collapse }"
      >{{ appName }}</span
    >
  </span>
</template>

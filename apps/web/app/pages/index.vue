<script setup lang="ts">
const { t } = useI18n()
const { appName } = useAppConfig()
</script>

<template>
  <UContainer class="py-12 sm:py-20">
    <section class="surface-glass p-8 sm:p-12">
      <div aria-hidden="true" class="mb-6 h-1.5 w-16 rounded-full bg-brand" />
      <h1 class="text-3xl font-semibold tracking-tight text-highlighted sm:text-5xl">
        {{ appName }}
      </h1>
      <p class="mt-4 text-lg text-muted">{{ t("home.description") }}</p>
    </section>
  </UContainer>
</template>

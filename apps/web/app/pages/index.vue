<script setup lang="ts">
const { t } = useI18n()
const { appName } = useAppConfig()
</script>

<template>
  <UContainer class="py-12 sm:py-16">
    <h1 class="text-3xl font-semibold text-highlighted sm:text-4xl">{{ appName }}</h1>
    <p class="mt-4 text-lg text-muted">{{ t("home.description") }}</p>
  </UContainer>
</template>

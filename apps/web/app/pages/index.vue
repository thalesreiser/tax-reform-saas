<script setup lang="ts">
// Placeholder home: value proposition and the two entry points (the landing page is FE-04.1).
const { t } = useI18n()
</script>

<template>
  <UContainer class="py-12 sm:py-20">
    <section class="surface-glass motion-enter p-8 sm:p-12 lg:p-16">
      <p class="text-sm font-semibold text-primary">{{ t("home.eyebrow") }}</p>
      <h1 class="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-highlighted sm:text-5xl">
        {{ t("home.title") }}
      </h1>
      <p class="mt-5 max-w-2xl text-lg text-muted">{{ t("home.description") }}</p>
      <div class="mt-8 flex flex-wrap gap-3">
        <UButton to="/cadastro" size="xl">{{ t("home.signUp") }}</UButton>
        <UButton to="/entrar" size="xl" variant="outline">{{ t("home.signIn") }}</UButton>
      </div>
    </section>
  </UContainer>
</template>

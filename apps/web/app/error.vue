<script setup lang="ts">
import type { NuxtError } from "#app"

const props = defineProps<{ error: NuxtError }>()
const { t } = useI18n()

// Only the status is shown: an error message can carry internal details.
const title = computed(() =>
  props.error.status === 404 ? t("error.notFound.title") : t("error.generic.title"),
)
const description = computed(() =>
  props.error.status === 404 ? t("error.notFound.description") : t("error.generic.description"),
)

useHead({ title })

async function backHome() {
  await clearError({ redirect: "/" })
}
</script>

<template>
  <UApp>
    <NuxtLayout>
      <UContainer class="py-12 sm:py-16">
        <p class="text-sm font-semibold text-primary">{{ props.error.status ?? 500 }}</p>
        <h1 class="mt-2 text-3xl font-semibold text-highlighted sm:text-4xl">{{ title }}</h1>
        <p class="mt-4 text-lg text-muted">{{ description }}</p>
        <UButton class="mt-8" @click="backHome">{{ t("error.backHome") }}</UButton>
      </UContainer>
    </NuxtLayout>
  </UApp>
</template>

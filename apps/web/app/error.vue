<script setup lang="ts">
import type { NuxtError } from "#app"
import { pt_br } from "@nuxt/ui/locale"

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
  <UApp :locale="pt_br">
    <NuxtLayout>
      <UContainer class="py-12 sm:py-20">
        <section class="surface-glass p-8 sm:p-12">
          <p class="text-sm font-semibold text-primary tabular-nums">
            {{ props.error.status ?? 500 }}
          </p>
          <h1 class="mt-2 text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
            {{ title }}
          </h1>
          <p class="mt-4 text-lg text-muted">{{ description }}</p>
          <UButton class="mt-8" size="lg" @click="backHome">{{ t("error.backHome") }}</UButton>
        </section>
      </UContainer>
    </NuxtLayout>
  </UApp>
</template>

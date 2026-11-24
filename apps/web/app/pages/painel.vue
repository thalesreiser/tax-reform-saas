<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui"
import type { OfficeInput } from "~/utils/auth"

// Placeholder office dashboard (FE-02.1 builds the real one). A new account has no office until
// it creates one here, with the name typed at sign-up when this browser still has it.
definePageMeta({ middleware: "auth" })

const { t } = useI18n()
const { createOffice } = useAuth()
const describe = useAuthMessage()

useHead({ title: t("dashboard.title") })

const { data: office, error: loadError, refresh } = await useOffice()

const schema = officeSchema(t)
const state = reactive({ officeName: "" })
const loading = ref(false)
const error = ref<string | null>(null)

onMounted(() => {
  try {
    state.officeName = localStorage.getItem(PENDING_OFFICE_KEY) ?? ""
  } catch {
    // Storage unavailable: the field starts empty.
  }
})

async function onSubmit(event: FormSubmitEvent<OfficeInput>) {
  loading.value = true
  error.value = null
  try {
    await createOffice(event.data.officeName)
    try {
      localStorage.removeItem(PENDING_OFFICE_KEY)
    } catch {
      // Nothing to clean up.
    }
    await refresh()
  } catch (e) {
    error.value = describe(authErrorMessage(e))
  } finally {
    loading.value = false
  }
}

// Illustrative tiles: no data source yet (FE-02.1), so they only show the empty state.
const kpis = ["clients", "simulations", "apiCalls"] as const
</script>

<template>
  <UContainer class="space-y-6 py-10 sm:py-16">
    <section class="surface-glass motion-enter p-6 sm:p-10">
      <template v-if="office">
        <p class="text-sm font-semibold text-primary">{{ t("dashboard.title") }}</p>
        <h1 class="mt-2 text-3xl font-semibold tracking-tight text-highlighted">
          {{ office.name }}
        </h1>
        <p class="mt-2 text-muted">
          {{ t("dashboard.role", { role: t(`roles.${office.role}`) }) }}
        </p>
        <div class="mt-6 flex flex-wrap items-center gap-3">
          <p class="text-default">{{ t("dashboard.start") }}</p>
          <UButton icon="i-lucide-plus" disabled>{{ t("dashboard.addClient") }}</UButton>
          <UBadge color="neutral" variant="subtle">{{ t("dashboard.soon") }}</UBadge>
        </div>
      </template>

      <UAlert
        v-else-if="loadError"
        role="alert"
        color="error"
        variant="subtle"
        :description="t('auth.errors.generic')"
      />

      <div v-else class="max-w-md space-y-4">
        <h1 class="text-2xl font-semibold tracking-tight text-highlighted">
          {{ t("dashboard.createOffice.title") }}
        </h1>
        <p class="text-muted">{{ t("dashboard.createOffice.description") }}</p>
        <UAlert v-if="error" role="alert" color="error" variant="subtle" :description="error" />
        <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
          <UFormField :label="t('auth.fields.officeName')" name="officeName" required>
            <UInput v-model="state.officeName" autocomplete="organization" class="w-full" />
          </UFormField>
          <UButton type="submit" size="lg" :loading="loading">
            {{ t("dashboard.createOffice.submit") }}
          </UButton>
        </UForm>
      </div>
    </section>

    <ul v-if="office" :aria-label="t('dashboard.kpis.label')" class="grid gap-4 sm:grid-cols-3">
      <li
        v-for="(kpi, i) in kpis"
        :key="kpi"
        class="motion-enter p-5"
        :class="i === 0 ? 'surface-brand' : 'surface-glass'"
      >
        <p class="text-sm" :class="i === 0 ? '' : 'text-muted'">{{ t(`dashboard.kpis.${kpi}`) }}</p>
        <p
          class="mt-1 text-3xl font-semibold tabular-nums"
          :class="i === 0 ? '' : 'text-highlighted'"
        >
          <span aria-hidden="true">—</span>
          <span class="sr-only">{{ t("dashboard.kpis.empty") }}</span>
        </p>
        <p class="mt-1 text-sm" :class="i === 0 ? '' : 'text-muted'">
          {{ t(`dashboard.kpis.${kpi}Hint`) }}
        </p>
      </li>
    </ul>
  </UContainer>
</template>

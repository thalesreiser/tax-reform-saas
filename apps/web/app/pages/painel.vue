<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui"
import type { OfficeInput } from "~/utils/auth"

// Dashboard home (FE-02.1). A new account has no office until it creates one here, with the name
// typed at sign-up when this browser still has it.
definePageMeta({ middleware: "auth", layout: "app" })

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

const dashboard = useDashboard()
const steps = computed(() => onboardingSteps(dashboard.value))
const onboarding = computed(() => nextStep(steps.value) !== undefined)
</script>

<template>
  <div class="space-y-6">
    <section class="surface-glass motion-enter p-6 sm:p-8">
      <template v-if="office">
        <p class="text-sm font-semibold text-primary">{{ t("dashboard.title") }}</p>
        <h1 class="mt-2 text-3xl font-semibold tracking-tight text-highlighted">
          {{ office.name }}
        </h1>
        <p class="mt-2 text-muted">
          {{ t("dashboard.role", { role: t(`roles.${office.role}`) }) }}
        </p>
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

    <template v-if="office">
      <DashboardOnboardingChecklist v-if="onboarding" :steps="steps" />
      <DashboardKpiTiles :kpis="dashboard.kpis" />
      <div class="grid gap-6 xl:grid-cols-2">
        <DashboardPortfolioRanking :rows="dashboard.portfolio" />
        <DashboardRecentSimulations :rows="dashboard.recentSimulations" />
      </div>
    </template>
  </div>
</template>

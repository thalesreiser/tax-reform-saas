<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui"
import type { OfficeInput } from "~/utils/auth"

// Placeholder office dashboard (FE-02.1 builds the real one). A new account has no office until
// it creates one here, with the name typed at sign-up when this browser still has it.
definePageMeta({ middleware: "auth" })

const { t } = useI18n()
const { getOffice, createOffice, signOut } = useAuth()
const describe = useAuthMessage()

useHead({ title: t("dashboard.title") })

// 403: signed in but without an office yet. Any other failure is shown as a generic error.
const {
  data: office,
  error: loadError,
  refresh,
} = await useAsyncData("office", async () => {
  try {
    return await getOffice()
  } catch (e) {
    if (errorStatus(e) === 403) return null
    throw e
  }
})

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

async function leave() {
  await signOut()
  await navigateTo("/entrar")
}
</script>

<template>
  <UContainer class="py-10 sm:py-16">
    <section class="surface-glass p-6 sm:p-10">
      <template v-if="office">
        <p class="text-sm font-semibold text-primary">{{ t("dashboard.title") }}</p>
        <h1 class="mt-2 text-3xl font-semibold tracking-tight text-highlighted">
          {{ office.name }}
        </h1>
        <p class="mt-2 text-muted">
          {{ t("dashboard.role", { role: t(`roles.${office.role}`) }) }}
        </p>
        <p class="mt-6 text-default">{{ t("dashboard.placeholder") }}</p>
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

      <UButton class="mt-8" variant="outline" color="neutral" @click="leave">
        {{ t("auth.signOut") }}
      </UButton>
    </section>
  </UContainer>
</template>

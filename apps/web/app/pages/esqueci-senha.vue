<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui"
import type { EmailInput } from "~/utils/auth"

const { t } = useI18n()
const { requestPasswordReset } = useAuth()
const describe = useAuthMessage()

useHead({ title: t("auth.forgot.title") })

const schema = emailSchema(t)
const state = reactive({ email: "" })
const loading = ref(false)
const error = ref<string | null>(null)
const sent = ref(false)

async function onSubmit(event: FormSubmitEvent<EmailInput>) {
  loading.value = true
  error.value = null
  try {
    await requestPasswordReset(event.data.email)
    sent.value = true
  } catch (e) {
    const message = authErrorMessage(e, "")
    // Anything but a limit or an outage gets the same answer, so the page never reveals accounts.
    if (message.key === "") sent.value = true
    else error.value = describe(message)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthCard :title="t('auth.forgot.title')" :description="t('auth.forgot.description')">
    <UAlert v-if="error" role="alert" color="error" variant="subtle" :description="error" />
    <UAlert
      v-if="sent"
      role="status"
      color="success"
      variant="subtle"
      :description="t('auth.forgot.sent')"
    />

    <UForm v-else :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField :label="t('auth.fields.email')" name="email" required>
        <UInput v-model="state.email" type="email" autocomplete="email" class="w-full" />
      </UFormField>
      <UButton type="submit" block size="lg" :loading="loading">
        {{ t("auth.forgot.submit") }}
      </UButton>
    </UForm>

    <template #footer>
      <ULink to="/entrar">{{ t("auth.backToSignIn") }}</ULink>
    </template>
  </AuthCard>
</template>

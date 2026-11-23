<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui"
import type { EmailInput } from "~/utils/auth"

// Landing page of the verification link: the API redirects here with `confirmado=1`, plus
// `error=<code>` when the token is invalid or expired.
const { t } = useI18n()
const route = useRoute()
const { resendVerification } = useAuth()
const describe = useAuthMessage()

const redirect = safeRedirect(route.query.redirect, "")
const confirmed = route.query.confirmado === "1" && route.query.error === undefined
const failed = route.query.error !== undefined
const title = confirmed ? t("auth.verify.confirmedTitle") : t("auth.verify.title")

useHead({ title })

const schema = emailSchema(t)
const state = reactive({ email: "" })
const loading = ref(false)
const error = ref<string | null>(null)
const sent = ref(false)

async function onSubmit(event: FormSubmitEvent<EmailInput>) {
  loading.value = true
  error.value = null
  try {
    const callback =
      "/verificar-email?confirmado=1" +
      (redirect ? `&redirect=${encodeURIComponent(redirect)}` : "")
    await resendVerification(event.data.email, callback)
    sent.value = true
  } catch (e) {
    error.value = describe(authErrorMessage(e))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthCard v-if="confirmed" :title="title" :description="t('auth.verify.confirmed')">
    <UButton :to="{ path: '/entrar', query: redirect ? { redirect } : {} }" block size="lg">
      {{ t("auth.signIn.submit") }}
    </UButton>
  </AuthCard>

  <AuthCard v-else :title="title" :description="t('auth.verify.description')">
    <UAlert
      v-if="failed"
      role="alert"
      color="error"
      variant="subtle"
      :description="t('auth.errors.linkInvalid')"
    />
    <UAlert v-if="error" role="alert" color="error" variant="subtle" :description="error" />
    <UAlert
      v-if="sent"
      role="status"
      color="success"
      variant="subtle"
      :description="t('auth.verify.resent')"
    />

    <UForm v-else :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField :label="t('auth.fields.email')" name="email" required>
        <UInput v-model="state.email" type="email" autocomplete="email" class="w-full" />
      </UFormField>
      <UButton type="submit" block size="lg" :loading="loading">
        {{ t("auth.verify.resend") }}
      </UButton>
    </UForm>
  </AuthCard>
</template>

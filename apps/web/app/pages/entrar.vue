<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui"
import type { SignInInput } from "~/utils/auth"

const { t } = useI18n()
const route = useRoute()
const { signIn, resendVerification } = useAuth()
const describe = useAuthMessage()
const redirect = safeRedirect(route.query.redirect)

useHead({ title: t("auth.signIn.title") })

const schema = signInSchema(t)
const state = reactive({ email: "", password: "" })
const loading = ref(false)
const error = ref<string | null>(null)
const unverified = ref(false)
const notice = ref<string | null>(null)

async function onSubmit(event: FormSubmitEvent<SignInInput>) {
  loading.value = true
  error.value = null
  notice.value = null
  try {
    await signIn(event.data)
    await navigateTo(redirect)
  } catch (e) {
    const message = authErrorMessage(e, "auth.errors.invalidCredentials")
    unverified.value = message.key === "auth.errors.emailNotVerified"
    error.value = describe(message)
  } finally {
    loading.value = false
  }
}

async function resend() {
  error.value = null
  try {
    await resendVerification(state.email.trim(), "/verificar-email?confirmado=1")
    unverified.value = false
    notice.value = t("auth.verify.resent")
  } catch (e) {
    error.value = describe(authErrorMessage(e))
  }
}
</script>

<template>
  <AuthCard :title="t('auth.signIn.title')" :description="t('auth.signIn.description')">
    <UAlert v-if="error" role="alert" color="error" variant="subtle" :description="error" />
    <UAlert v-if="notice" role="status" color="success" variant="subtle" :description="notice" />
    <UButton v-if="unverified" variant="link" class="px-0" @click="resend">
      {{ t("auth.verify.resend") }}
    </UButton>

    <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField :label="t('auth.fields.email')" name="email" required>
        <UInput v-model="state.email" type="email" autocomplete="email" class="w-full" />
      </UFormField>
      <UFormField :label="t('auth.fields.password')" name="password" required>
        <PasswordInput v-model="state.password" autocomplete="current-password" />
      </UFormField>
      <ULink to="/esqueci-senha" class="text-sm">{{ t("auth.signIn.forgot") }}</ULink>
      <UButton type="submit" block size="lg" :loading="loading">
        {{ t("auth.signIn.submit") }}
      </UButton>
    </UForm>

    <template #footer>
      {{ t("auth.signIn.noAccount") }}
      <ULink :to="{ path: '/cadastro', query: route.query }">{{ t("auth.signIn.signUp") }}</ULink>
    </template>
  </AuthCard>
</template>

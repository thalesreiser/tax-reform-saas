<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui"
import type { SignUpInput } from "~/utils/auth"

const { t } = useI18n()
const route = useRoute()
const { signUp } = useAuth()
const describe = useAuthMessage()

// After confirming the e-mail, sign-in returns to `redirect`. Invitees (redirect to an invitation)
// join the inviting office, so they are not asked for an office name.
const redirect = safeRedirect(route.query.redirect, "")
const invitation = /^\/convites\/[^/?#]+$/.test(redirect)
const callbackPath =
  "/verificar-email?confirmado=1" + (redirect ? `&redirect=${encodeURIComponent(redirect)}` : "")

useHead({ title: t("auth.signUp.title") })

const schema = signUpSchema(t, !invitation)
const state = reactive({ name: "", email: "", password: "", officeName: "" })
const hint = computed(() => {
  const { key, count } = passwordHint(state.password.length)
  return t(key, { min: PASSWORD_MIN_LENGTH, count }, count)
})
const loading = ref(false)
const error = ref<string | null>(null)
const sentTo = ref<string | null>(null)

async function onSubmit(event: FormSubmitEvent<SignUpInput>) {
  loading.value = true
  error.value = null
  const { officeName, ...account } = event.data
  try {
    await signUp(account, callbackPath)
    // The office is created after the first sign-in (no session before the e-mail is confirmed).
    if (officeName) {
      try {
        localStorage.setItem(PENDING_OFFICE_KEY, officeName)
      } catch {
        // Storage unavailable: the dashboard asks for the name again.
      }
    }
    sentTo.value = account.email
  } catch (e) {
    error.value = describe(authErrorMessage(e))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthCard
    v-if="sentTo"
    :title="t('auth.signUp.checkEmailTitle')"
    :description="t('auth.signUp.checkEmail', { email: sentTo })"
  >
    <UButton :to="{ path: '/entrar', query: route.query }" variant="outline" block>{{
      t("auth.signIn.submit")
    }}</UButton>
  </AuthCard>

  <AuthCard v-else :title="t('auth.signUp.title')" :description="t('auth.signUp.description')">
    <UAlert v-if="error" role="alert" color="error" variant="subtle" :description="error" />

    <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField :label="t('auth.fields.name')" name="name" required>
        <UInput v-model="state.name" autocomplete="name" class="w-full" />
      </UFormField>
      <UFormField
        v-if="!invitation"
        :label="t('auth.fields.officeName')"
        name="officeName"
        required
      >
        <UInput v-model="state.officeName" autocomplete="organization" class="w-full" />
      </UFormField>
      <UFormField :label="t('auth.fields.email')" name="email" required>
        <UInput v-model="state.email" type="email" autocomplete="email" class="w-full" />
      </UFormField>
      <UFormField :label="t('auth.fields.password')" name="password" :help="hint" required>
        <PasswordInput v-model="state.password" autocomplete="new-password" />
      </UFormField>
      <UButton type="submit" block size="lg" :loading="loading">
        {{ t("auth.signUp.submit") }}
      </UButton>
    </UForm>

    <template #footer>
      {{ t("auth.signUp.hasAccount") }}
      <ULink :to="{ path: '/entrar', query: route.query }">{{ t("auth.signIn.submit") }}</ULink>
    </template>
  </AuthCard>
</template>

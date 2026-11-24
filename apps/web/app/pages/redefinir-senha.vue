<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui"
import type { NewPasswordInput } from "~/utils/auth"

// Landing page of the reset link: the API redirects here with `token`, or `error=INVALID_TOKEN`.
const { t } = useI18n()
const route = useRoute()
const { resetPassword } = useAuth()
const describe = useAuthMessage()

const token = typeof route.query.token === "string" && !route.query.error ? route.query.token : ""

useHead({ title: t("auth.reset.title") })

const schema = newPasswordSchema(t)
const state = reactive({ password: "" })
const hint = computed(() => {
  const { key, count } = passwordHint(state.password.length)
  return t(key, { min: PASSWORD_MIN_LENGTH, count }, count)
})
const loading = ref(false)
const error = ref<string | null>(null)
const done = ref(false)

async function onSubmit(event: FormSubmitEvent<NewPasswordInput>) {
  loading.value = true
  error.value = null
  try {
    await resetPassword(token, event.data.password)
    done.value = true
  } catch (e) {
    error.value = describe(authErrorMessage(e, "auth.errors.linkInvalid"))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthCard v-if="done" :title="t('auth.reset.doneTitle')" :description="t('auth.reset.done')">
    <UButton to="/entrar" block size="lg">{{ t("auth.signIn.submit") }}</UButton>
  </AuthCard>

  <AuthCard v-else :title="t('auth.reset.title')" :description="t('auth.reset.description')">
    <template v-if="!token">
      <UAlert
        role="alert"
        color="error"
        variant="subtle"
        :description="t('auth.errors.linkInvalid')"
      />
      <UButton to="/esqueci-senha" variant="outline" block>{{ t("auth.reset.again") }}</UButton>
    </template>

    <template v-else>
      <UAlert v-if="error" role="alert" color="error" variant="subtle" :description="error" />
      <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField :label="t('auth.fields.newPassword')" name="password" :help="hint" required>
          <PasswordInput v-model="state.password" autocomplete="new-password" />
        </UFormField>
        <UButton type="submit" block size="lg" :loading="loading">
          {{ t("auth.reset.submit") }}
        </UButton>
      </UForm>
    </template>
  </AuthCard>
</template>

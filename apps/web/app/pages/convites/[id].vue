<script setup lang="ts">
// Target of the invitation e-mail (`WEB_URL/convites/<id>`). The API shows an invitation only to
// the signed-in, verified invitee, so anonymous visitors are asked to sign in or sign up first.
const { t } = useI18n()
const route = useRoute()
const { session, refreshSession, getInvitation, acceptInvitation, signOut } = useAuth()
const describe = useAuthMessage()

const id = String(route.params.id)
const here = { redirect: `/convites/${encodeURIComponent(id)}` }

useHead({ title: t("auth.invitation.title") })

const { data } = await useAsyncData(`invitation:${id}`, async () => {
  if ((await refreshSession()) === null) return { invitation: null, error: null }
  try {
    return { invitation: await getInvitation(id), error: null }
  } catch (e) {
    return { invitation: null, error: authErrorMessage(e, "auth.errors.invitationUnavailable") }
  }
})

const invitation = computed(() => data.value?.invitation ?? null)
const loadError = computed(() => (data.value?.error ? describe(data.value.error) : null))
const roleLabel = computed(() =>
  invitation.value?.role === "owner" ? t("roles.owner") : t("roles.accountant"),
)
const accepting = ref(false)
const acceptError = ref<string | null>(null)

async function accept() {
  accepting.value = true
  acceptError.value = null
  try {
    await acceptInvitation(id)
    await navigateTo("/painel")
  } catch (e) {
    acceptError.value = describe(authErrorMessage(e, "auth.errors.invitationUnavailable"))
  } finally {
    accepting.value = false
  }
}

async function switchAccount() {
  await signOut()
  await navigateTo({ path: "/entrar", query: here })
}
</script>

<template>
  <AuthCard :title="t('auth.invitation.title')">
    <template v-if="!session">
      <p class="text-muted">{{ t("auth.invitation.signInFirst") }}</p>
      <UButton :to="{ path: '/entrar', query: here }" block size="lg">
        {{ t("auth.signIn.submit") }}
      </UButton>
      <UButton :to="{ path: '/cadastro', query: here }" variant="outline" block size="lg">
        {{ t("auth.signUp.submit") }}
      </UButton>
    </template>

    <template v-else-if="invitation">
      <p class="text-default">
        {{ t("auth.invitation.summary", { office: invitation.organizationName, role: roleLabel }) }}
      </p>
      <UAlert
        v-if="acceptError"
        role="alert"
        color="error"
        variant="subtle"
        :description="acceptError"
      />
      <UButton block size="lg" :loading="accepting" @click="accept">
        {{ t("auth.invitation.accept") }}
      </UButton>
    </template>

    <template v-else>
      <UAlert role="alert" color="error" variant="subtle" :description="loadError ?? ''" />
      <p class="text-sm text-muted">
        {{ t("auth.invitation.signedInAs", { email: session.user.email }) }}
      </p>
      <UButton variant="outline" block @click="switchAccount">
        {{ t("auth.invitation.switchAccount") }}
      </UButton>
    </template>
  </AuthCard>
</template>

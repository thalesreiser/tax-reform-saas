// Pages with `definePageMeta({ middleware: "auth" })` need a session; anonymous users go to sign-in
// and come back afterwards.
export default defineNuxtRouteMiddleware(async (to) => {
  const { session, refreshSession } = useAuth()
  if (session.value === null && (await refreshSession()) === null) {
    return navigateTo({ path: "/entrar", query: { redirect: to.fullPath } })
  }
})

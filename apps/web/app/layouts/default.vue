<script setup lang="ts">
const { t, locale } = useI18n()
const { appName } = useAppConfig()
const route = useRoute()
const { session } = useAuth()
const year = new Date().getFullYear()

// Switching between sign-in and sign-up keeps the return path (e.g. an invitation).
const authQuery = computed(() =>
  typeof route.query.redirect === "string" ? { redirect: route.query.redirect } : {},
)

useHead({
  htmlAttrs: { lang: locale },
  titleTemplate: (title) => (title ? `${title} · ${appName}` : appName),
})
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <a
      href="#conteudo"
      class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-default focus:px-4 focus:py-2 focus:font-medium focus:text-highlighted focus:shadow-glass focus:ring-2 focus:ring-primary"
    >
      {{ t("layout.skipToContent") }}
    </a>

    <UHeader :title="appName" to="/" :toggle="false">
      <template #title>
        <AppWordmark collapse />
      </template>
      <template #right>
        <AppAccountMenu v-if="session" />
        <template v-else>
          <UButton
            v-if="route.path !== '/entrar'"
            :to="{ path: '/entrar', query: authQuery }"
            color="neutral"
            variant="ghost"
          >
            {{ t("layout.signIn") }}
          </UButton>
          <UButton v-if="route.path !== '/cadastro'" :to="{ path: '/cadastro', query: authQuery }">
            {{ t("layout.signUp") }}
          </UButton>
        </template>
        <UColorModeButton />
      </template>
    </UHeader>

    <UMain id="conteudo" tabindex="-1" class="flex-1 focus:outline-none">
      <slot />
    </UMain>

    <UFooter class="border-t border-default">
      <p class="text-sm text-muted tabular-nums">{{ t("layout.footer", { appName, year }) }}</p>
    </UFooter>
  </div>
</template>

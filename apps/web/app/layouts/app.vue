<script setup lang="ts">
// Shell of signed-in pages: header (office, account menu, colour mode), sidebar navigation on large
// screens and the same navigation in a drawer on phones. Public and auth pages keep `default`.
const { t, locale } = useI18n()
const { appName } = useAppConfig()
const menuOpen = ref(false)

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

    <UHeader
      v-model:open="menuOpen"
      :title="appName"
      to="/painel"
      mode="slideover"
      :menu="{ side: 'left', title: t('appShell.menuTitle') }"
    >
      <template #title>
        <AppWordmark collapse />
      </template>
      <template #right>
        <AppAccountMenu />
        <UColorModeButton />
      </template>
      <template #body>
        <AppNav @navigate="menuOpen = false" />
      </template>
    </UHeader>

    <div class="mx-auto flex w-full max-w-(--ui-container) flex-1 gap-8 px-4 sm:px-6 lg:px-8">
      <div class="hidden w-60 shrink-0 py-8 lg:block">
        <AppNav />
      </div>
      <main id="conteudo" tabindex="-1" class="min-w-0 flex-1 py-8 focus:outline-none sm:py-10">
        <slot />
      </main>
    </div>

    <UFooter class="border-t border-default">
      <p class="text-sm text-muted tabular-nums">
        {{ t("layout.footer", { appName, year: new Date().getFullYear() }) }}
      </p>
    </UFooter>
  </div>
</template>

<script setup lang="ts">
const { t, locale } = useI18n()
const { appName } = useAppConfig()
const year = new Date().getFullYear()

useHead({
  htmlAttrs: { lang: locale },
  titleTemplate: (title) => (title ? `${title} · ${appName}` : appName),
})
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <a
      href="#conteudo"
      class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-default focus:px-4 focus:py-2 focus:ring-2 focus:ring-primary"
    >
      {{ t("layout.skipToContent") }}
    </a>

    <UHeader :title="appName" to="/" :toggle="false" />

    <UMain id="conteudo" tabindex="-1" class="flex-1 focus:outline-none">
      <slot />
    </UMain>

    <UFooter>
      <p class="text-sm text-muted">{{ t("layout.footer", { appName, year }) }}</p>
    </UFooter>
  </div>
</template>

// https://nuxt.com/docs/4.x/api/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2026-11-23",
  ssr: true,
  modules: ["@nuxt/ui", "@nuxtjs/i18n"],
  css: ["~/assets/css/main.css"],
  devtools: { enabled: false },
  telemetry: false,

  ui: {
    // No external font provider: the visual identity (FE-01.2) decides typography.
    fonts: false,
  },

  icon: {
    // Icons are bundled from the local Lucide collection; never fetched from the Iconify API.
    serverBundle: { collections: ["lucide"] },
    fallbackToApi: false,
  },

  i18n: {
    defaultLocale: "pt-BR",
    strategy: "no_prefix",
    detectBrowserLanguage: false,
    locales: [{ code: "pt-BR", language: "pt-BR", name: "Português (Brasil)", file: "pt-BR.json" }],
  },

  typescript: {
    strict: true,
    // Tooling files and end-to-end tests run in Node, outside the app context.
    nodeTsConfig: {
      compilerOptions: { types: ["node"] },
      include: ["../vitest.config.ts", "../test/e2e/**/*"],
    },
  },
})

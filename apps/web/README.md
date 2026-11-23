# @trs/web

Nuxt 4 web app (server-side rendered): the accountant dashboard, the simulator, the business owner
share view and the public landing pages arrive here task by task (FE tracks).

| Path                      | What it is                                                     |
| ------------------------- | -------------------------------------------------------------- |
| `app/app.vue`             | Root component: Nuxt UI `UApp` wrapping the layout and pages   |
| `app/app.config.ts`       | App config, including the placeholder product name (`appName`) |
| `app/layouts/default.vue` | Base shell: skip link, header, main landmark, footer           |
| `app/pages/`              | File-based routes (`index.vue` is the placeholder home page)   |
| `app/error.vue`           | Error page (404 and unexpected errors), rendered in the layout |
| `i18n/locales/pt-BR.json` | Every user-facing string                                       |
| `test/e2e/`               | End-to-end tests against the built, server-rendered app        |

## Conventions

- **UI library:** [Nuxt UI](https://ui.nuxt.com) v4 with its default neutral theme. Colours,
  typography and logo are decided in FE-01.2; do not restyle components before that.
- **No external requests for assets:** `@nuxt/fonts` is disabled and icons come from the local
  Lucide collection (`@iconify-json/lucide`); the Iconify API fallback is off. No analytics, CDNs or
  third-party fonts.
- **Text:** user-facing text is Brazilian Portuguese and lives in `i18n/locales/pt-BR.json`
  (`@nuxtjs/i18n`, `no_prefix` strategy, `pt-BR` only). Templates use `t("key")`; never hard-code a
  string in a component. The product name comes from `useAppConfig().appName`.
- **Accessibility (WCAG 2.1 AA, RNF-07):** every page renders inside the default layout, so it gets
  the skip link, `header`, `main#conteudo` and `footer` landmarks and `<html lang="pt-BR">`. Each
  page has exactly one `h1`.
- **Errors:** the error page shows the status and a generic message, never `error.message`, which
  can carry internal details.
- **Types and lint:** `nuxt prepare` runs on install and generates `.nuxt/` (types and the
  referenced tsconfig files). `pnpm typecheck` runs `nuxt typecheck` (vue-tsc); ESLint uses the
  shared type-aware config plus `eslint-plugin-vue` for `.vue` files.
- **Tests:** Vitest with `@nuxt/test-utils/e2e`: the suite builds the app and asserts on the
  server-rendered HTML. Visual checks use the PR preview deployment (EST-03.2).

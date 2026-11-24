# @trs/web

Nuxt 4 web app (server-side rendered): the accountant dashboard, the simulator, the business owner
share view and the public landing pages arrive here task by task (FE tracks).

| Path                      | What it is                                                      |
| ------------------------- | --------------------------------------------------------------- |
| `app/app.vue`             | Root component: Nuxt UI `UApp` wrapping the layout and pages    |
| `app/app.config.ts`       | App config: placeholder product name (`appName`), Nuxt UI theme |
| `app/assets/css/main.css` | Aurora theme: palettes, semantic tokens, utilities              |
| `app/theme/aurora.ts`     | Nuxt UI semantic colour -> palette name                         |
| `app/components/`         | Shared components (wordmark, account menu, auth card and panel) |
| `app/composables/`        | `useAuth` (API auth calls), `useAuthMessage`, `useOffice`       |
| `app/middleware/auth.ts`  | Route middleware: anonymous users go to `/entrar`               |
| `app/utils/auth.ts`       | Form schemas, API error -> message key, safe redirects          |
| `app/layouts/default.vue` | Base shell: skip link, header, main landmark, footer            |
| `app/layouts/app.vue`     | Signed-in shell: header, sidebar navigation / drawer, main      |
| `app/utils/dashboard.ts`  | Dashboard view model, navigation items, impact formatting       |
| `app/pages/`              | File-based routes (`index.vue` is the placeholder home page)    |
| `app/error.vue`           | Error page (404 and unexpected errors), rendered in the layout  |
| `i18n/locales/pt-BR.json` | Every user-facing string                                        |
| `test/e2e/`               | End-to-end tests against the built, server-rendered app         |
| `test/unit/`              | Unit tests (contrast, auth validation and error messages)       |
| `test/nuxt/`              | Component tests in the Nuxt runtime (happy-dom) with fixtures   |
| `.env.example`            | Runtime variables (`NUXT_PUBLIC_API_URL`, `PORT`)               |

## Conventions

- **UI library:** [Nuxt UI](https://ui.nuxt.com) v4 themed with the Aurora direction
  ([ADR 006](../../docs/adr/006-visual-direction-aurora.md)). See "Theming" below.
- **No external requests for assets:** `@nuxt/fonts` is disabled; Outfit is self-hosted from
  `@fontsource-variable/outfit` and icons come from the local Lucide collection
  (`@iconify-json/lucide`) with the Iconify API fallback off. No analytics, CDNs or third-party
  fonts; the e2e suite fails if the page links an external host.
- **Text:** user-facing text is Brazilian Portuguese and lives in `i18n/locales/pt-BR.json`
  (`@nuxtjs/i18n`, `no_prefix` strategy, `pt-BR` only). Templates use `t("key")`; never hard-code a
  string in a component. The product name comes from `useAppConfig().appName`.
- **Accessibility (WCAG 2.1 AA, RNF-07):** every page renders inside the default layout, so it gets
  the skip link, `header`, `main#conteudo` and `footer` landmarks and `<html lang="pt-BR">`. Each
  page has exactly one `h1`.
- **Errors:** the error page shows the status and a generic message, never `error.message`, which
  can carry internal details. Browser and Worker errors go to Sentry only when
  `NUXT_PUBLIC_SENTRY_DSN` is set (`app/plugins/sentry.client.ts`, `server/plugins/sentry.ts`,
  scrubbed by `shared/utils/sentry-scrub.ts`); without it the SDK chunk is never loaded. See
  `deploy/README.md`, Observability.
- **Types and lint:** `nuxt prepare` runs on install and generates `.nuxt/` (types and the
  referenced tsconfig files). `pnpm typecheck` runs `nuxt typecheck` (vue-tsc); ESLint uses the
  shared type-aware config plus `eslint-plugin-vue` for `.vue` files.
- **Tests:** Vitest with `@nuxt/test-utils/e2e`: the suite builds the app and asserts on the
  server-rendered HTML. Visual checks use the PR preview deployment (EST-03.2).

## Theming

- **Palettes** live in `app/assets/css/main.css` under `@theme static` as hex values
  (`--color-<name>-50` ... `-950`): `iris` (violet, primary), `azure` (blue, secondary and info),
  `mint` (success, gains), `ember` (warning, increases), `ruby` (error), `dusk` (neutral).
  `app/theme/aurora.ts` maps them to Nuxt UI's semantic colours, and `app.config.ts` passes the map to
  `ui.colors`.
- **Semantic tokens** override Nuxt UI's variables in `:root` (light) and `.dark`: text, background,
  border, radius (`--ui-radius: 0.5rem`, so controls are 12px and cards 16px) and the shade each
  semantic colour uses. Light mode uses the 700 shades (500 for violet) so text passes 4.5:1 on the pale
  gradient. Use Nuxt UI classes (`text-muted`, `bg-primary`, `text-success`) rather than palette
  shades in components.
- **Dark mode** follows the system preference (Nuxt UI colour mode); it is a proposal pending
  approval (ADR 006).
- **Utilities:** `surface-glass` (translucent card with blur; opaque white or night card when
  `backdrop-filter` is unsupported, or with `prefers-reduced-transparency: reduce` or
  `prefers-contrast: more`), `bg-brand` (decorative gradient, never under text), `bg-brand-strong`
  (gradient safe for white text), `surface-brand` (card on the strong gradient: brand panel, lead
  KPI), `pill-gain` and `pill-increase`, `shadow-glass`, `motion-enter` (180 ms fade and rise of
  cards and tiles). Animations and transitions are cut under `prefers-reduced-motion: reduce`.
- **Numbers** use `tabular-nums`: Outfit's Latin subset has the `tnum` feature (every digit
  590 units wide), so no separate numeric font is needed.
- **Header:** colour-mode toggle on every page; "Entrar" and "Criar conta" when signed out (minus
  the current page's), office name and account menu ("Sair") when signed in.
- **Adding a colour:** add an 11-shade hex scale in `@theme static`, map it in `app/theme/aurora.ts`
  (a new semantic name also needs `ui.theme.colors` in `nuxt.config.ts`), set the text shade in
  `:root` and `.dark`, add its tokens to `test/unit/contrast.test.ts` and keep the test green. Text never
  goes below 4.5:1 (3:1 for large text and UI graphics).

## Auth flow (RF-01)

The API (`apps/api`, README "Auth") runs better-auth under `/api/auth/*` and sets an `HttpOnly`
session cookie. The web app calls it directly at `NUXT_PUBLIC_API_URL` with
`credentials: "include"` (`useAuth`); during server rendering it forwards the incoming `cookie`
header, so pages and the `auth` middleware know the session before hydration. Copy is provisional.

| Route              | What it does                                                                          |
| ------------------ | ------------------------------------------------------------------------------------- |
| `/entrar`          | Sign-in, then back to `?redirect=` (same-app paths only) or `/painel`                 |
| `/cadastro`        | Account + office name; shows "check your e-mail" (no sign-in before confirming)       |
| `/verificar-email` | Target of the verification link (`confirmado=1` or `error=`); resends the link        |
| `/convites/<id>`   | Invitation link: sign in or up with the invited e-mail, see office and role           |
| `/esqueci-senha`   | Asks for a reset link (same answer whether or not the e-mail exists)                  |
| `/redefinir-senha` | Target of the reset link (`token` or `error=`); sets the new password                 |
| `/painel`          | Protected shell: office, role and empty KPI tiles (`GET /office`), or office creation |

- **Office creation:** sign-up cannot create the office (no session until the e-mail is confirmed),
  so the name typed there waits in `localStorage` and `/painel` creates the office
  (`organization/create`) on the first visit without one (`GET /office` answers 403).
- **Invitations:** the API shows an invitation only to the signed-in invitee, so anonymous visitors
  are sent to `/entrar` or `/cadastro` with `redirect=/convites/<id>`; accepting makes it the active
  office and opens `/painel`.
- **Errors:** `authErrorMessage()` maps the problem details `code` (and 429 `Retry-After`) to
  pt-BR messages; unknown e-mails and wrong passwords get the same message.
- **Deployment:** the browser calls the API cross-origin, so the API must allow `WEB_URL` with
  credentials (CORS, exposing `Retry-After`), and server rendering only sees the session when the
  cookie reaches the web host (same site, or a shared cookie domain). Both are pending on the API.
- **Tests:** `test/e2e/auth.test.ts` renders the pages against a small mock API (`node:http`), so the
  web suite never needs the real API.

## App shell and dashboard (FE-02.1)

- **Layout `app`:** signed-in pages set `definePageMeta({ layout: "app" })`. It keeps the skip link
  and `main#conteudo`, adds `AppNav` (`nav` labelled "Navegação principal") as a sidebar from `lg`
  and inside the header's slide-over menu below it, and the header shows office name, account menu
  and colour-mode toggle. Navigation items live in `NAV_ITEMS`; an item with `to: null` (page not
  built yet) renders as `aria-disabled` with "Em breve", never as a link.
- **`/painel`:** `useDashboard()` returns a typed `DashboardView`. Until the client, simulation and
  usage endpoints exist (BE-02.2, BE-02.4, BE-03.2) it is the empty state of a new office: no
  numbers. Sections are components in `app/components/dashboard/` that take the view model as props:
  onboarding checklist (next step on `surface-brand`), KPI tiles, portfolio ranking by impact in
  2033 and last simulations. Impact values are decimal strings in percentage points, formatted
  without `number` arithmetic (`formatPoints`), with the tone spelled out for screen readers.
- **Tests:** `test/nuxt/dashboard.test.ts` mounts the components with the populated fixture
  (`test/nuxt/fixtures/dashboard.ts`, fictional data); the e2e suite checks the empty state,
  landmarks, disabled navigation and the menu toggle.

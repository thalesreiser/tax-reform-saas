# 006 - Visual direction "Aurora" with AA contrast adjustments

- **Status:** accepted (dark mode: proposed, pending Thales's approval)
- **Date:** 2026-11-23
- **Decided by:** Thales Reiser
- **Reference:** DEC-03, FE-01.2, RNF-07

## Context

The web app (FE-01.1) ran on Nuxt UI's default neutral theme. Two audiences use it: accountants, daily
and on large screens with dense tables, and business owners, who open a shared link once, usually on a
phone. The interface must meet WCAG 2.1 AA (RNF-07) and must not load assets from third-party hosts
(no font CDNs, no analytics). Two rounds of options were shown on the same three screens (office
dashboard, simulator chart, business owner view on a phone).

## Options considered

1. **A - Livro-razão:** sober petrol blue and cool greys, IBM Plex with mono numbers; rigorous but plain.
2. **B - Claro e acolhedor:** light, money green with amber highlights, Manrope; friendly, little
   personality.
3. **C - Formulário fiscal:** numbered fields, dashed borders, highlighter yellow, Space Grotesk and
   JetBrains Mono; original but busy.
4. **D - Noite fiscal:** dark-first navy with teal and amber, Sora / Inter / JetBrains Mono; striking,
   tiring as the only theme.
5. **E - Azul profundo e coral:** cobalt with coral highlights, Plus Jakarta Sans; balanced, coral needs
   discipline.
6. **F - Grafite e lima:** graphite and electric lime, Geist; very modern, lime unusable as text.
7. **G - Aurora:** lavender-to-mint gradient, frosted glass cards, violet primary, mint for gains,
   Outfit; the most pleasant for business owners, needs care with contrast and performance.
8. **H - Editorial:** forest green and saffron, Fraunces / DM Sans / DM Mono; sophisticated, less
   technological.

## Decision

Thales chose **G - Aurora** on 2026-11-23. Tokens (light): page gradient `#eef0ff -> #f1f7ff -> #e8fbf4`,
foreground `#1c1b3a`, muted `#62628a`, lines `rgba(98,98,138,.18)`, glass cards
`rgba(255,255,255,.66)` with a white border, violet shadow and `blur(10px)`, radius 16px (cards) and 12px
(controls), primary violet `#6d4aff`, secondary blue `#3aa8ff`, brand gradient `#6d4aff -> #3aa8ff`,
mint `#2dd4a7`, and **Outfit** for headings, body and tabular numbers, self-hosted from
`@fontsource-variable/outfit`.

### Accessibility adjustments

Measured contrast forced the changes below; the look is kept and only colours under text get darker.
`apps/web/test/unit/contrast.test.ts` reads the shipped CSS and checks every pair in both modes.

| Pair (worst case)                           | Reference          | Before | Shipped                                | After |
| ------------------------------------------- | ------------------ | -----: | -------------------------------------- | ----: |
| White text on the brand gradient            | `#6d4aff->#3aa8ff` |   2.55 | `#6d4aff->#1f6fd1` (`bg-brand-strong`) |  4.94 |
| Blue (secondary, info) text on the page     | `#3aa8ff`          |   2.25 | azure-700 `#1a5cb0`                    |  5.79 |
| Gain text on white                          | `#0e8f6e`          |   4.06 | mint-700 `#0b7259`                     |  5.89 |
| Gain text on its pill over a glass card     | `#0e8f6e`          |   3.46 | mint-700 `#0b7259`                     |  5.02 |
| Increase text on its pill over a glass card | `#c2410c`          |   4.32 | ember-700 `#b23c0b`                    |  4.95 |
| White text on hovered solid buttons         | `bg-primary/75`    |   3.33 | opaque next shade (iris-600 `#5a35eb`) |  6.68 |
| Error text on the page (Nuxt UI default)    | red-500            |   3.36 | ruby-700 `#b91c1c`                     |  5.71 |

Unchanged and passing: violet `#6d4aff` as text on the page (4.55, tightest pair) and under white text
(5.15); muted `#62628a` on the page (5.10). The decorative gradient `#6d4aff -> #3aa8ff` stays for the
mark and accents that carry no text.

### Dark mode (proposal, pending approval)

Follows the system preference through Nuxt UI's colour mode. Deep indigo night page
`#221956 -> #0d0b26 -> #112335` (faint violet and mint glow), glass cards `rgba(28,27,58,.6)` with a
`rgba(255,255,255,.08)` border (opaque fallback `#1c1b3a`), text `#dcdcee`, headings white, muted
`#9494b8`, and the accents at their 400 shades (violet `#9a7dff`, blue `#5cb6ff`, mint `#2dd4a7`,
orange `#fb923c`, red `#f87171`) with `#1c1b3a` text on solid buttons. Every pair is at least 5:1.

## Consequences

- `apps/web/app/assets/css/main.css` holds the palettes (`@theme static`), the semantic overrides of
  Nuxt UI's variables, the `surface-glass`, `bg-brand`, `bg-brand-strong`, `pill-gain` and
  `pill-increase` utilities and the reduced-motion rule; `app/theme/aurora.ts` maps the palettes to
  Nuxt UI's semantic colours.
- Glass falls back to an opaque card without `backdrop-filter` support, with
  `prefers-reduced-transparency: reduce` or with `prefers-contrast: more`.
- Text never sits on the decorative gradient, on `#3aa8ff` or on `#2dd4a7`.
- Chart colours (current `#cfcaf7`, reform `#6d4aff`) are left for FE-03.2: `#cfcaf7` is below the 3:1
  needed for graphics against the page and needs an outline or a darker shade there.
- The wordmark is provisional until the product name (Q-01) and the logo are decided.

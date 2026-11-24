# 001 - Stack

- **Status:** accepted
- **Date:** 2026-11-23
- **Decided by:** Thales Reiser
- **Reference:** EST-01.1

## Context

The product needs a multi-tenant web app, a public API, a browser extension and SDKs, built by one
developer in about 12 weeks. New taxes must match the official Receita Federal engines exactly.
The engines are Java 25 / Spring Boot 4 services with a read-only SQLite database built by Flyway,
and they get frequent releases (Release 15 in October 2026, Release 16 planned). The developer
already works with Nuxt and TypeScript. The development machine has little RAM, so everything is
built and verified in CI.

## Options considered

1. **Official engines as unmodified sidecars + TypeScript monorepo:** exact official results,
   upgrades are a tag bump; one language for web, API, extension and SDK. Cost: two JVM services
   to host.
2. **Use a community port (TypeScript, PHP, Python):** no JVM, but no parity guarantee and it lags
   behind official releases.
3. **Fork the engines and build the product in Java:** one runtime, but merges with upstream on
   every release and a second language for the front end and extension anyway.

## Decision

Option 1.

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo, Node 24, strict TypeScript |
| Official engines | `calculadora-rtc-regime-regular` and `calculadora-rtc-simples-nacional`, built in CI from a pinned tag into images on GHCR; never modified |
| API | Fastify, OpenAPI 3.1, Scalar docs, problem details (RFC 9457) |
| Current-tax engine | `packages/tax-legacy`, pure TypeScript, decimal arithmetic, rule tables versioned by validity date |
| Simulation | `packages/simulation`, combines the current-tax engine, the transition schedule and the official engines |
| Database | Postgres (Supabase, see ADR 007), Drizzle ORM and migrations, row-level security per office |
| Auth | better-auth (organizations, roles, invitations) |
| Web | Nuxt 4 (dashboard, simulator, share view, landing) |
| Extension | WXT (Manifest V3) + Vue, Chrome and Edge first |
| SDK | TypeScript generated from the OpenAPI spec; PHP after the MVP |
| Billing | Asaas (Pix, boleto, card, subscriptions) |
| Hosting | Web on Cloudflare with PR previews; API and engines on Google Cloud Run (ADR 007) |
| Observability | Structured logs, Sentry, uptime checks |

## Consequences

- Engines are reached only through `packages/engine-client`, generated from their OpenAPI spec.
- A weekly workflow checks upstream releases and opens a PR bumping the tag; golden contract tests
  must pass before merge.
- Every stored result records the engine tag and the rule table version.
- Hosting cost includes two JVM containers (about 512 MB to 1 GB RAM each; measured in MOT-01.1).

# Development plan

Work breakdown in six tracks: **structural (EST), tax engines (MOT), API (BE), web (FE), extension
(EXT) and business (NEG)**. Each task is one Trello card (pt-BR) and, when it changes the
repository, one pull request. Estimates are hours of focused work. The stack is in
[ADR 001](adr/001-stack.md); pending items are in [03 - Open questions](03-open-questions.md).

**Release cut:** go-live (NEG-01.5) needs every **M** task. **S** tasks ship right after launch.

| Track | Tasks | Total | Needed for launch (M) |
|---|---|---|---|
| Structural | 10 | 33 h | 33 h |
| Tax engines | 15 | 63 h | 61 h |
| API | 22 | 90 h | 85 h |
| Web | 17 | 72 h | 72 h |
| Extension | 6 | 29 h | 29 h |
| Business | 5 | 14 h | 14 h |
| **Total** | **75** | **301 h** | **294 h** |

At 25 h per week the M scope takes 12 weeks; at 20 h per week, 15 weeks (Q-03).

## Process
- **Definition of Ready:** requirement and acceptance criterion written, dependencies done (tasks,
  questions, decisions), estimate set. Only ready cards go to *Pronto*.
- **Definition of Done:** the PR template checklist plus the card's sub-tasks ticked; CI green.
- **Flow:** Backlog → Pronto → Em andamento → Revisão (PR open) → Concluído (merged).
- **Accountant gate:** tasks marked *(validation)* end with a review session with the partner
  accountant; their golden cases become tests that block merges.
- **Who decides:** design, UI, UX, tax rules, API contract breaks, security, infrastructure and cost
  go to Thales with options and a recommendation, and end in an ADR. Routine implementation choices
  are listed in the PR.
- Every card gets dated comments at start, PR opened and completion.

## Milestones

| Week | Milestone | Main tasks |
|---|---|---|
| 1-2 | Foundation: monorepo, CI, official engines running in staging | EST-01, EST-02, MOT-01.1-01.3, BE-01 |
| 3-5 | Accountant dashboard on real data | BE-02.1-02.3, FE-01, FE-02.1-02.3 |
| 4-8 | Current-tax engine and simulator, validated by the accountant | MOT-02, MOT-03, BE-02.4-02.6, FE-03 |
| 8-10 | Public API and SDK | BE-03, MOT-01.4-01.5 |
| 10-12 | Extension, billing, beta and go-live | EXT-01, BE-04, BE-05, FE-04, NEG-01 |

## Structural

### EST-01 - Repository foundation (10 h)

| ID | Task | Req. | Prio. | Est. | Depends on |
|---|---|---|---|---|---|
| EST-01.1 | Vision, requirements, plan, stack ADR and Trello board | — | M | 4 h | — |
| EST-01.2 | Monorepo and tooling | RNF-08 | M | 4 h | EST-01.1 |
| EST-01.3 | Contributor rules, templates and branch protection | RNF-08 | M | 2 h | EST-01.2 |

- **EST-01.2** pnpm workspaces and Turborepo · Node 24 pinned · strict TypeScript base · ESLint and Prettier · commitlint · `apps/` and `packages/` skeleton
- **EST-01.3** CLAUDE.md · PR template · CODEOWNERS and Dependabot · fictional-data rule for fixtures · `main` and `develop` protected

### EST-02 - CI and security (9 h)

| ID | Task | Req. | Prio. | Est. | Depends on |
|---|---|---|---|---|---|
| EST-02.1 | CI pipeline | RNF-08 | M | 4 h | EST-01.2 |
| EST-02.2 | Security automation | RNF-02 | M | 2 h | EST-02.1 |
| EST-02.3 | API container image | RNF-02 | M | 3 h | BE-01.1 |

- **EST-02.1** Lint, typecheck, unit tests, build with Turborepo cache · Postgres service for integration tests · required checks
- **EST-02.2** gitleaks · dependency audit · CodeQL · SECURITY.md
- **EST-02.3** Multi-stage Dockerfile · non-root · image scan

### EST-03 - Infrastructure (14 h)

| ID | Task | Req. | Prio. | Est. | Depends on |
|---|---|---|---|---|---|
| EST-03.1 | Accounts and environments (manual, Thales) | — | M | 3 h | — |
| EST-03.2 | Deploy pipeline: web previews and API + engines staging | RNF-08 | M | 5 h | EST-03.1, EST-02.3, MOT-01.2 |
| EST-03.3 | Observability | RNF-09 | M | 3 h | EST-03.2 |
| EST-03.4 | Backups and production readiness checklist | RNF-02 | M | 3 h | EST-03.3 |

- **EST-03.1** Cloudflare · Google Cloud project with billing and budget alert · Supabase project in `sa-east-1` · domain · secrets in each host's secret store (ADR 007)
- **EST-03.2** Cloudflare PR preview · Artifact Registry remote repository for GHCR · Cloud Run services (API public, engines internal via Direct VPC egress) · migrations on deploy
- **EST-03.3** Structured logs · Sentry (web, API, extension) · uptime checks
- **EST-03.4** Postgres backups and restore test · runbook · rollback

## Tax engines

### MOT-01 - Official engines (18 h)

| ID | Task | Req. | Prio. | Est. | Depends on |
|---|---|---|---|---|---|
| MOT-01.1 | Spike: build both engines in CI from a pinned tag | RNF-01 | M | 5 h | EST-02.1 |
| MOT-01.2 | Engine images on GHCR with health checks | RNF-01 | M | 4 h | MOT-01.1 |
| MOT-01.3 | Typed engine client | RNF-01 | M | 3 h | MOT-01.2 |
| MOT-01.4 | Upstream watcher | RNF-01 | M | 3 h | MOT-01.5 |
| MOT-01.5 | Golden contract tests against the engines | RNF-06 | M | 3 h | MOT-01.3 |

- **MOT-01.1** Flyway database generation · Java 25 build · memory and start-up time measured · decision record of results
- **MOT-01.2** One image per engine · offline profile · `/versao` exposed · compose for CI
- **MOT-01.3** `packages/engine-client` generated from the engines' OpenAPI · decimal parsing · error mapping
- **MOT-01.4** Weekly workflow checks new tags and opens a bump PR with the changelog
- **MOT-01.5** Upstream examples (`docs/exemplos.md`) as fixtures · run in CI with the engine containers

### MOT-02 - Current-tax engine (29 h)

| ID | Task | Req. | Prio. | Est. | Depends on |
|---|---|---|---|---|---|
| MOT-02.1 | Domain model and versioned rule tables | RNF-04, RNF-05 | M | 3 h | EST-01.2 |
| MOT-02.2 | Simples Nacional | RF-04 | M | 6 h | MOT-02.1, Q-04 |
| MOT-02.3 | PIS and Cofins | RF-04 | M | 5 h | MOT-02.1 |
| MOT-02.4 | ICMS | RF-04 | M | 5 h | MOT-02.1, Q-05 |
| MOT-02.5 | ISS | RF-04 | M | 2 h | MOT-02.1 |
| MOT-02.6 | IPI | RF-21 | S | 2 h | MOT-02.1 |
| MOT-02.7 | Validation with the accountant (validation) | RNF-06 | M | 6 h | MOT-02.2-02.5, Q-06 |

- **MOT-02.1** `packages/tax-legacy` · decimal.js · tables keyed by validity date · ADR on the model
- **MOT-02.2** Annexes I-V · brackets and effective rate · factor R · DAS split by tax
- **MOT-02.3** Cumulative (Presumido) and non-cumulative (Real) with credits on purchases
- **MOT-02.4** Internal rate per UF · interstate 4/7/12% · notice when ST or DIFAL would apply
- **MOT-02.5** Municipal rate informed, bounded 2-5%
- **MOT-02.7** Golden cases spreadsheet per regime · cases turned into tests · review session · fixes

### MOT-03 - Transition and simulation (16 h)

| ID | Task | Req. | Prio. | Est. | Depends on |
|---|---|---|---|---|---|
| MOT-03.1 | Transition schedule 2026-2033 | RF-04, RNF-05 | M | 4 h | MOT-02.1 |
| MOT-03.2 | Simulation orchestrator | RF-04, RF-05, RF-06 | M | 8 h | MOT-03.1, MOT-01.3, MOT-02.2-02.5 |
| MOT-03.3 | Simulator validation with the accountant (validation) | RNF-06 | M | 4 h | MOT-03.2, MOT-02.7 |

- **MOT-03.1** CBS/IBS test rates 2026 · CBS from 2027 and end of PIS/Cofins · ICMS/ISS reduction 2029-2032 · full IBS 2033 · source of each number recorded
- **MOT-03.2** `packages/simulation` · profile → yearly scenarios · current taxes + official engine · Simples vs regular vs Simples with IBS/CBS outside the DAS · credits for the buyer
- **MOT-03.3** Three reference companies simulated with the accountant · differences explained or fixed

## API

### BE-01 - Foundation (15 h)

| ID | Task | Req. | Prio. | Est. | Depends on |
|---|---|---|---|---|---|
| BE-01.1 | Fastify app | RNF-10 | M | 4 h | EST-01.2 |
| BE-01.2 | Database schema with row-level security | RNF-02 | M | 5 h | BE-01.1 |
| BE-01.3 | Auth, offices, roles and invitations | RF-01 | M | 6 h | BE-01.2 |

- **BE-01.1** Config validation · `/health` · OpenAPI 3.1 · problem details · request IDs · logs
- **BE-01.2** Drizzle schema and migrations · RLS by office · test helpers
- **BE-01.3** better-auth organizations · owner and accountant roles · invitation e-mail · rate-limited login

### BE-02 - Accountant domain (27 h)

| ID | Task | Req. | Prio. | Est. | Depends on |
|---|---|---|---|---|---|
| BE-02.1 | Office settings and members | RF-01 | M | 3 h | BE-01.3 |
| BE-02.2 | Clients with CNPJ lookup | RF-02 | M | 4 h | BE-01.3 |
| BE-02.3 | Fiscal profile | RF-03 | M | 5 h | BE-02.2 |
| BE-02.4 | Simulations: run, store, compare | RF-04-RF-07 | M | 5 h | BE-02.3, MOT-03.2 |
| BE-02.5 | PDF report with office branding | RF-08 | M | 5 h | BE-02.4 |
| BE-02.6 | Share link for the business owner | RF-09 | M | 3 h | BE-02.4 |
| BE-02.7 | Audit log | RF-18 | M | 2 h | BE-01.2 |

### BE-03 - Public API (30 h)

| ID | Task | Req. | Prio. | Est. | Depends on |
|---|---|---|---|---|---|
| BE-03.1 | API keys per client | RF-10 | M | 4 h | BE-02.2, Q-08 |
| BE-03.2 | Rate limit and usage metering | RF-14 | M | 4 h | BE-03.1 |
| BE-03.3 | Invoice calculation endpoint | RF-11, RNF-03 | M | 5 h | BE-03.1, MOT-01.3, BE-02.3 |
| BE-03.4 | XML group generation and validation endpoints | RF-12 | M | 3 h | BE-03.3 |
| BE-03.5 | Reference data endpoints with cache | RF-13 | M | 3 h | MOT-01.3 |
| BE-03.6 | Public docs and versioning policy | RNF-10 | M | 2 h | BE-03.3 |
| BE-03.7 | TypeScript SDK | RF-15 | M | 4 h | BE-03.6 |
| BE-03.8 | PHP SDK | RF-20 | S | 5 h | BE-03.7 |

- **BE-03.1** Hashed keys · scopes (calculate, xml, reference) · rotation and revocation
- **BE-03.3** `POST /v1/calculations` · defaults from the profile · engine selection by regime · calculation memory in the response · p95 measured
- **BE-03.7** Generated from OpenAPI · published to npm · examples

### BE-04 - Billing (11 h)

| ID | Task | Req. | Prio. | Est. | Depends on |
|---|---|---|---|---|---|
| BE-04.1 | Plans and subscriptions with Asaas | RF-17 | M | 8 h | BE-01.3, Q-02 |
| BE-04.2 | Plan limits enforcement | RF-17 | M | 3 h | BE-04.1, BE-03.2 |

### BE-05 - LGPD and security (7 h)

| ID | Task | Req. | Prio. | Est. | Depends on |
|---|---|---|---|---|---|
| BE-05.1 | Data map, export and deletion per client | RF-19 | M | 4 h | BE-02.4 |
| BE-05.2 | Security review (OWASP API Top 10) | RNF-02 | M | 3 h | BE-03.4 |

## Web (Nuxt 4)

### FE-01 - Foundation (13 h)

| ID | Task | Req. | Prio. | Est. | Depends on |
|---|---|---|---|---|---|
| FE-01.1 | Nuxt 4 app | RNF-07 | M | 4 h | EST-01.2 |
| FE-01.2 | Visual direction (decision, Thales) | RNF-07 | M | 4 h | FE-01.1, DEC-03 |
| FE-01.3 | Auth screens | RF-01 | M | 5 h | FE-01.2, BE-01.3 |

### FE-02 - Accountant dashboard (23 h)

| ID | Task | Req. | Prio. | Est. | Depends on |
|---|---|---|---|---|---|
| FE-02.1 | Dashboard home | — | M | 5 h | FE-01.3 |
| FE-02.2 | Client list and creation with CNPJ autofill | RF-02 | M | 4 h | FE-02.1, BE-02.2 |
| FE-02.3 | Fiscal profile wizard | RF-03 | M | 6 h | FE-02.2, BE-02.3 |
| FE-02.4 | Office settings, members, branding and API keys | RF-01, RF-10 | M | 5 h | FE-02.1, BE-03.1 |
| FE-02.5 | Billing pages | RF-17 | M | 3 h | FE-02.4, BE-04.1 |

### FE-03 - Simulator (21 h)

| ID | Task | Req. | Prio. | Est. | Depends on |
|---|---|---|---|---|---|
| FE-03.1 | Simulation form | RF-04 | M | 5 h | FE-02.3 |
| FE-03.2 | Results: yearly chart and breakdown per tax | RF-04, RF-07 | M | 6 h | FE-03.1, BE-02.4 |
| FE-03.3 | Scenario comparison | RF-05 | M | 4 h | FE-03.2 |
| FE-03.4 | Business owner share view (mobile-first) | RF-09 | M | 4 h | FE-03.2, BE-02.6 |
| FE-03.5 | Calculation memory and disclaimers | RF-07 | M | 2 h | FE-03.2 |

### FE-04 - Public pages (15 h)

| ID | Task | Req. | Prio. | Est. | Depends on |
|---|---|---|---|---|---|
| FE-04.1 | Landing page and pricing | — | M | 5 h | FE-01.2, Q-02 |
| FE-04.2 | Terms and privacy pages | RF-19 | M | 1 h | NEG-01.3 |
| FE-04.3 | Developer portal (docs, SDK, sandbox key) | RF-15 | M | 4 h | BE-03.6 |
| FE-04.4 | Onboarding flow for a new office | RF-01 | M | 5 h | FE-02.5 |

## Extension (WXT)

### EXT-01 - Invoice issuer extension (29 h)

| ID | Task | Req. | Prio. | Est. | Depends on |
|---|---|---|---|---|---|
| EXT-01.1 | Spike: map the Emissor Nacional da NFS-e invoice form | RF-16 | M | 5 h | — |
| EXT-01.2 | WXT scaffold, sign-in with API key, options page | RF-16 | M | 5 h | EXT-01.1, BE-03.1 |
| EXT-01.3 | Read the form, call the API, show the result panel | RF-16 | M | 6 h | EXT-01.2, BE-03.3 |
| EXT-01.4 | Fill the IBS/CBS fields and show validation errors | RF-16 | M | 6 h | EXT-01.3 |
| EXT-01.5 | Resilience: remote selectors, failure telemetry, copy-paste fallback | RF-16 | M | 4 h | EXT-01.4 |
| EXT-01.6 | Publish to Chrome Web Store and Edge Add-ons | RF-16 | M | 3 h | EXT-01.5, Q-01 |

## Business

### NEG-01 - Launch (14 h)

| ID | Task | Req. | Prio. | Est. | Depends on |
|---|---|---|---|---|---|
| NEG-01.1 | Product name and domain (manual, Thales) | — | M | 1 h | Q-01 |
| NEG-01.2 | Pricing model (manual, Thales) | RF-17 | M | 2 h | Q-02 |
| NEG-01.3 | Terms of use, privacy policy and disclaimer review (manual) | RF-19 | M | 3 h | NEG-01.1 |
| NEG-01.4 | Beta with 2-3 accounting offices | — | M | 6 h | FE-03.4, BE-03.7, EXT-01.4 |
| NEG-01.5 | Go-live | — | M | 2 h | NEG-01.4, EST-03.4, BE-05.2, all M tasks |

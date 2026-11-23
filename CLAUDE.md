# Working on tax-reform-saas

Read this file before every task. It applies to every contributor, human or automated. If anything
here conflicts with another document, follow the stricter rule and point out the conflict on the task
card.

## Sources of truth

- **Development plan** (tracks, tasks, sub-tasks, estimates): `docs/development-plan.md`.
- **Vision and scope:** `docs/01-vision-and-scope.md`. **Requirements:** `docs/02-requirements.md`.
- **Decisions taken:** `docs/adr/`. **Decisions pending:** `docs/03-open-questions.md`.
- **Task board** (Trello, pt-BR): https://trello.com/b/kP6YrZQD. Card names carry the task ID, e.g.
  `[MOT-02.2]`.

## Tax rules come first

- **The official engines are never modified.** `calculadora-rtc-regime-regular` and
  `calculadora-rtc-simples-nacional` (Receita Federal, MIT) run as containers pinned to a release tag.
  CBS, IBS and IS values always come from them, never from a port or our own formula. Reach them only
  through `packages/engine-client`.
- **Current-tax rules** (Simples, PIS/Cofins, ICMS, ISS, IPI) live in `packages/tax-legacy`, in tables
  versioned by validity date. Every number carries its legal source in a comment or in the table.
- **Money is decimal.** Never use JavaScript `number` arithmetic for amounts or rates; use the decimal
  library adopted in MOT-02.1. Rounding follows the official engine.
- **Golden cases from the partner accountant are law.** They become tests; a failing golden case blocks
  the merge. Never change an expected value to make a test pass: ask on the card.
- **Every stored result records** the engine tag and the rule table version, so it can be reproduced.
- **Estimates are labelled.** Reference rates are provisional; results shown to users say so.

## Who decides what

Contributors implement; Thales decides. Never decide the items below on your own:

- **Design, UI and UX:** visual identity, layout, navigation, interface copy, mobile behaviour.
- **Tax rules:** any rate, base, credit or transition rule not already in an approved golden case or
  ADR. When the law is unclear, ask; never guess.
- **Data model:** migrations that drop or rename tables or columns, or change a column type.
- **API contract:** changing or removing a public `/v1` route, or a payload change that breaks a
  consumer (SDK, extension, partner ERP).
- **Security and personal data:** authentication, permissions, API keys, tenant isolation, logging of
  fiscal data.
- **Integrations, infrastructure and cost:** a new or replaced provider, a relevant new dependency, a
  paid plan, any change to CI/CD or repository settings.
- **Removing a feature** or changing behaviour a customer can notice.

When you reach one of these:

1. Pause only the affected part; keep working on the rest of the task.
2. Ask on the task card and in the PR: context, 2 or 3 options with pros and cons, impact and a
   recommendation.
3. Wait for Thales's answer on the card.
4. Record the decision as an ADR (`docs/adr/NNN-short-title.md`, see `000-template.md`), close the
   item in `docs/03-open-questions.md` and link the ADR from the PR.
5. Resume following the ADR.

Routine implementation choices (library versions inside the agreed stack, lint strictness, file
layout) do not need a decision: pick the most sensible option and list it under "Implementation
choices" in the PR description with the reason.

## Workflow for every task

1. **Pick** a card in "Pronto" and move it to "Em andamento".
2. **Check the Definition of Ready.** If an acceptance criterion, a decision or a golden case is
   missing, comment what is missing and pick another card.
3. **Read** this file, the plan entry for the task, related ADRs and the surrounding code.
4. **Branch** from an up-to-date `develop`: `feat/<task-id>-<slug>`, `fix/<task-id>-<slug>` or
   `chore/<task-id>-<slug>`.
5. **Tests first** for tax and business rules, then the code.
6. **Commit** in small steps (see Conventions).
7. **Verify in CI, not locally.** Push the branch and open the PR; lint, typecheck, format, build and
   tests run in CI. The development laptop has 7.7 GB of RAM and no Docker, so builds, test suites,
   the JVM engines and dev servers are not run on it. Visual checks use the PR preview deployment.
8. **Open the PR** against `develop` with the template, then move the card to "Revisão".
9. **Address review** with new commits; never rewrite history that was already reviewed.
10. **Merge** is always done by Thales. The card goes to "Concluído" after the merge.

`develop` deploys to staging (from EST-03.2). A version tag on `main` deploys to production.

If you are stuck after two attempts (an error you do not understand, a test you cannot make pass, an
unclear requirement), stop, describe what you tried on the card and ask for help. Never work around it
by disabling a test, a lint rule or a type check.

Task cards get dated comments in Portuguese when work starts, when the PR opens and when it is done.

## Commands

| Command                             | What it does                         |
| ----------------------------------- | ------------------------------------ |
| `pnpm install`                      | Install everything and the Git hooks |
| `pnpm build`                        | Build every package (Turborepo)      |
| `pnpm typecheck`                    | Type-check every package             |
| `pnpm lint`                         | ESLint in every package              |
| `pnpm test`                         | Tests in every package               |
| `pnpm format` / `pnpm format:check` | Prettier (write / check only)        |

These run in CI. Locally, only `pnpm install --lockfile-only` is needed to update the lockfile.

## Conventions

- Node.js 24 LTS and pnpm 10 only (`pnpm install` refuses other versions).
- TypeScript `strict`; no `any`, no `@ts-ignore`, `@ts-expect-error` only with a description.
- Follow existing patterns and reuse packages and schemas before creating new ones.
- One task per branch and per PR, roughly 400 changed lines at most, not counting the lockfile and
  generated code; split bigger work.
- Tax and business rules ship with tests. Never delete, weaken or skip a test to make CI pass.
- **Language:** code, commits, branches, PRs and repository docs in English; Trello cards and comments
  in Brazilian Portuguese; user-facing text in Brazilian Portuguese.
- **Commits:** Conventional Commits with the task ID, e.g. `feat(tax-legacy): add factor R (MOT-02.2)`.
  No co-author trailers or tool-generated footers in commits or PRs, and no mention of the tools used
  to write the code.

## What never goes into this repository

The repository is public ([ADR 002](docs/adr/002-public-repository.md)).

- Secrets of any kind: API keys, tokens, passwords, certificates, `.env` files (only `.env.example`).
- **Real fiscal data:** CNPJs, invoices, revenue, client names or addresses from offices or their
  clients, even in tests or fixtures. The partner accountant's golden cases use anonymised companies.
- Business-sensitive data: prices negotiated with customers, contracts, draft legal texts.

**Fixtures use fictional data only:** generated CNPJs that are clearly test values, invented companies
and example addresses. Official engine examples (`docs/exemplos.md` upstream) may be reused as they are.

## Finishing a task

- Fill the PR template: Definition of Done, decisions, what could not be tested.
- UI changes include desktop and mobile screenshots from the preview deployment.
- Merge and production deploys are always done by Thales.

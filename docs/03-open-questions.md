# 03 - Open questions and decisions

Questions (Q) need information; decisions (DEC) need a choice. Each answer that changes the plan
ends in an ADR.

## Open

| ID | Question | Recommendation | Blocks |
|---|---|---|---|
| Q-01 | Product name and domain | — | NEG-01.1, FE-01.2, EXT-01.6 |
| Q-02 | Pricing: per client company, per API call, or tiers combining both | Tiers by number of client companies, API calls included with overage | NEG-01.2, BE-04.1 |
| Q-03 | How many hours per week are available for the project | — | Schedule |
| Q-04 | Should the comparison include IRPJ, CSLL and CPP, or only consumption taxes | Only consumption taxes in the MVP; Simples DAS split to isolate them | MOT-02.2, MOT-03.2 |
| Q-05 | ICMS-ST, DIFAL and state benefits stay out of the MVP | Yes, out; show a notice when the profile needs them | MOT-02.4 |
| Q-06 | Partner accountant: availability per week, how golden cases are delivered, compensation | Spreadsheet of cases per regime, one review session per week | MOT-02.7, MOT-03.3 |
| Q-08 | API key per client company or per office | Per client company, created by the office | BE-03.1 |

## Answered

| ID | Answer | Date | ADR |
|---|---|---|---|
| — | Stack approved (TypeScript monorepo, official engines as sidecars) | 2026-11-23 | [001](adr/001-stack.md) |
| — | Plugin = public API + SDK and browser extension | 2026-11-23 | [001](adr/001-stack.md) |
| — | Simulator = current vs reform, 2026-2033 | 2026-11-23 | — |
| — | Customer = accounting offices | 2026-11-23 | — |
| — | Thales has a partner accountant to validate rules | 2026-11-23 | — |
| Q-07 | The extension's first target is the Emissor Nacional da NFS-e; the form mapping and its risks become an ADR in EXT-01.1 | 2026-11-23 | — |
| DEC-02 | Public repository with a proprietary licence | 2026-11-23 | [002](adr/002-public-repository.md) |
| DEC-03 | Visual direction "G - Aurora" (lavender-to-mint gradient, glass cards, violet primary, Outfit), with AA contrast adjustments; dark mode proposal pending approval | 2026-11-23 | [006](adr/006-visual-direction-aurora.md) |
| DEC-01 | Cloud Run (API and engines) and Supabase (Postgres) in São Paulo, free plans for staging and beta | 2026-11-23 | [007](adr/007-hosting-cloud-run-supabase.md) |

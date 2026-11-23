# 005 - Transition schedule 2026-2033 as rule tables without reference-rate values

- **Status:** proposed
- **Date:** 2026-11-23
- **Decided by:** Thales Reiser (pending review)
- **Reference:** MOT-03.1, RF-04, RNF-05

## Context

EC 132/2023 (ADCT arts. 125-133) and LC 214/2025 (arts. 343-365, 454, 501, 508, 542, 543) fix part of
the transition in the law itself: CBS 0.9% and IBS 0.1% in 2026, IBS 0.05% + 0.05% in 2027-2028, the
CBS reduction of 0.1 p.p. in 2027-2028, the end of PIS/Cofins and the zero IPI (except Zona Franca de
Manaus) from 2027, ICMS and ISS at 9/10, 8/10, 7/10 and 6/10 of their rates in 2029-2032, and their
extinction in 2033. The CBS reference rate (2027-2033) and the IBS reference rates (2029-2033) are not
in the law: the Senate fixes them each year by resolution from TCU calculations (LC 214/2025,
art. 349), and they may take effect mid-year when fixed late (art. 349, § 2º). CBS and IBS values must
come from the official engine (ADR 001).

## Options considered

1. **Encode only what the law fixes; reference rates as a `REFERENCE` mode flagged `provisional`,
   without a value.** No duplicated source of truth; the official engine supplies the rate. The
   simulation layer must ask the engine for the rate of each year.
2. **Also store the reference rates (TCU proposals, Senate resolutions) in the tables.** Simpler for
   the simulator, but duplicates the engine's data, goes stale, and mixes proposals with law.

## Decision

Option 1, in `packages/tax-legacy/src/transition.ts`: one `defineRuleTable` per tax (PIS/Cofins, IPI,
ICMS, ISS, CBS, IBS), with year-aligned versions from 2026-01-01 to 2033-12-31, each citing its
provision on planalto.gov.br. `transitionRules(year | date)` resolves all of them, returns every
factor and rate as a decimal with its source and version id, and rejects dates outside 2026-2033.
The package depends on `@trs/shared-types` to reuse `TransitionYear` and `isTransitionYear`.

## Consequences

- MOT-03.2 takes the reference rate from the official engine and applies the CBS adjustment
  (−0.1 p.p. in 2027-2028) and the ICMS/ISS factor from this module.
- 2034 onwards (LC 214/2025, arts. 366 and 369) is out of scope; the tables end in 2033.
- A new Senate resolution needs no change here; a change in the law needs a new table version.

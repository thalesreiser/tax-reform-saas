# 003 - Current-tax engine: decimal policy and versioned rule tables

- **Status:** accepted
- **Date:** 2026-11-23
- **Decided by:** Thales Reiser (implementation choice under ADR 001, recorded for traceability)
- **Reference:** MOT-02.1, RNF-04, RNF-05

## Context

The simulator compares the current consumption taxes (Simples Nacional, PIS, Cofins, IPI, ICMS, ISS)
with CBS, IBS and IS computed by the official engines. Both sides must round the same way, or the
comparison shows differences that come from arithmetic rather than from the reform. Rules change over
time (Simples brackets, ICMS rates per state, the 2026-2033 transition), and a stored simulation must
be reproducible years later.

The official engine's numeric policy is documented in its ADR003 (`calculadora-rtc-regime-regular`,
17/11/2026): HALF_EVEN, exact internal arithmetic, division bounded to 34 significant digits, each
published number rounded once at its layout scale (2 places for amounts, 4 for rates), and the
published number is what enters the next step.

## Options considered

1. **decimal.js with the official policy, rule tables as typed TypeScript data:** same results as the
   engine, tables reviewed in pull requests, type-checked and tested; no database needed.
2. **Integer cents:** simple for amounts, but rates with 4 decimal places and chained percentages
   need ad hoc scaling, and rounding mode handling is manual.
3. **Rule tables in the database:** editable without a deploy, but changes skip code review and the
   accountant's golden cases, and reproducing an old result needs table history in the database.

## Decision

Option 1, in `packages/tax-legacy`:

- `Fiscal`, a decimal.js constructor with 34 significant digits and HALF_EVEN. Values are parsed from
  text only (`dec("12.34")`); JavaScript numbers are rejected at the boundary.
- `toAmount` (2 places) and `toRate` (4 places) are the only rounding points.
  `calculateTaxAmount` rounds the base and the rate, multiplies the published values and rounds the
  amount, exactly as the official engine does.
- `defineRuleTable` holds versions with `validFrom`, optional `validTo` (inclusive), a mandatory legal
  source and a value. It rejects empty tables, invalid dates, reversed ranges, versions out of order,
  overlaps, open-ended versions before the last, and missing sources. Gaps are allowed and fail when a
  date inside them is resolved.
- `resolveRule(table, date)` returns the value, its source and a version id `<table>@<validFrom>`,
  which every stored result records.

## Consequences

- MOT-02.2 to MOT-02.6 add one table per rule set and pure functions on top of this model; each table
  version cites its legal source.
- Changing a rule is a pull request with tests, reviewed against the accountant's golden cases.
- Rule updates need a deploy. Acceptable: rules change by law, with notice, a few times a year.

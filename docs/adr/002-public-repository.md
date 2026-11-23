# 002 - Public repository with a proprietary licence

- **Status:** accepted
- **Date:** 2026-11-23
- **Decided by:** Thales Reiser
- **Reference:** DEC-02, EST-01.3

## Context

The repository was created private. On GitHub Free, a private repository has no branch protection or
required checks (`HTTP 403: Upgrade to GitHub Pro or make this repository public`) and shares 2,000
Actions minutes a month with the owner's other private repositories. All verification runs in CI, and
the official engines (two JVM services) will be built and tested there too.

## Options considered

1. **Public with a proprietary licence:** branch protection, required checks, secret scanning, push
   protection and unlimited Actions minutes on standard runners, at no cost. Anyone can read the code,
   although the licence does not allow reusing it.
2. **Private on GitHub Free:** the code stays hidden, but merges rely on discipline and CI competes for
   minutes.
3. **Private on GitHub Pro:** hidden code and required checks, at a monthly cost and with a minute limit.

## Decision

Option 1, decided by Thales on 2026-11-23. A full-history gitleaks scan found no leaks before the
change.

## Consequences

- `main` and `develop` require a pull request, linear history and resolved conversations, with no force
  push or deletion, and the rules apply to admins. No approval is required, since there is one
  maintainer. The CI job is a required check; EST-02.1 replaces it with an aggregate check.
- Secret scanning, push protection, Dependabot alerts and security updates, and private vulnerability
  reporting are enabled.
- Secrets, real fiscal data and business-sensitive data must never enter the repository (`CLAUDE.md`).
  Pricing, contracts and the partner accountant's raw spreadsheets stay in private documents; only
  anonymised golden cases are committed.
- The competitive edge lives in the validated rule tables, the integrations and the service, not in
  hiding the code.

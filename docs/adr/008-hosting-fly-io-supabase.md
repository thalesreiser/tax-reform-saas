# 008 - Hosting: Fly.io for the API and engines, Supabase for Postgres

- **Status:** accepted
- **Date:** 2026-11-23
- **Decided by:** Thales Reiser
- **Reference:** DEC-01, EST-03.1, EST-03.2; supersedes [ADR 007](007-hosting-cloud-run-supabase.md)

## Context

ADR 007 chose Google Cloud Run, but Google Cloud billing in Brazil offered no individual (CPF)
profile, only CNPJ. The next option, an Oracle Cloud Always Free VM, hit the same wall: its Brazilian
sign-up now shows only the "Corporate" customer type and requires a CNPJ (also reported on Oracle's
community forum in November 2026). The project has no CNPJ yet. The backend needs about 2.5 GB of RAM
(API plus two JVM engines, [ADR 004](004-official-engines-runtime.md)); Thales wants to start at no
cost, keep data in Brazil and avoid lock-in.

## Options considered

1. **Fly.io + Supabase:** managed containers billed in USD on a personal card (no tax ID), region
   São Paulo (`gru`), private networking between apps, machines that stop when idle and start on the
   next request. The free plan includes US$ 5 of usage a month.
2. **Oracle Cloud Always Free VM:** free, but blocked without a CNPJ.
3. **Google Cloud Run:** blocked without a CNPJ.
4. **Wait for a CNPJ:** blocks deploys and previews.

## Decision

Option 1 for staging and beta:

| Layer | Choice |
|---|---|
| API | Fly app `trs-tax-api`, region `gru`, public HTTPS from Fly, auto stop/start, minimum 0 machines |
| Engines | Fly apps `trs-engine-rr` and `trs-engine-sn`, region `gru`, **no public IP**, reachable only on the Fly private network, 768 MB, auto stop/start |
| Database | Supabase free, `sa-east-1` (Pro with daily backups before real client data) |
| Web | Cloudflare with PR previews (ADR 001) |
| Deploy | CI deploys the images already tested and published to GHCR, with per-app deploy tokens stored as GitHub secrets |

For production (before real client data): minimum 1 machine for the API and each engine, Supabase Pro.
Cloud Run (ADR 007) is the destination once a CNPJ exists.

**Portability rule (kept from ADR 007):** no provider-specific feature enters the code without an ADR.
Provider specifics live only in deploy configuration (`fly.toml` files and the deploy workflow).

## Consequences

- **Cost:** with machines stopped when idle, staging and beta are expected to fit the US$ 5 monthly
  allowance; stopped machines only pay for their root file system. Usage is checked after each deploy
  step and monthly. Billed in USD (IOF applies).
- **Cold starts:** the first call after idle waits for the engine to start (about 25 s); acceptable in
  staging and beta. POST calculations are never retried (MOT-01.3).
- **Private engines:** the engines get no public IP; the API calls them through their private
  addresses (environment variables), so the engine client keeps plain base URLs.
- **Images:** `linux/amd64`, as built today; no change to the image workflows.
- **Secrets:** API secrets via `fly secrets set` (database URL, `BETTER_AUTH_SECRET`, engine URLs),
  deploy tokens as GitHub secrets; never in the repository or the chat.
- **Database connection:** Supabase pooler in transaction mode for the API, direct connection for
  migrations, login user member of `trs_app` (BE-01.2); `withOffice` works with `SET LOCAL` in
  transactions (confirm in staging).
- **Rate limiting:** still in memory per process; moves to Postgres or Redis before production.
- **Moving later:** the same images run on Cloud Run or any VPS; a move is about a day of deploy and
  DNS work, with no downtime.

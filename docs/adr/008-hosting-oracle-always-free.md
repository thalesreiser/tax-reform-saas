# 008 - Hosting: Oracle Cloud Always Free VM for the API and engines, Supabase for Postgres

- **Status:** accepted
- **Date:** 2026-11-23
- **Decided by:** Thales Reiser
- **Reference:** DEC-01, EST-03.1, EST-03.2; supersedes [ADR 007](007-hosting-cloud-run-supabase.md)

## Context

ADR 007 chose Google Cloud Run, but activating Google Cloud billing in Brazil offered no individual
(CPF) profile: it requires a CNPJ, which the project does not have yet. The backend needs about
2.5 GB of RAM (API plus two JVM engines, [ADR 004](004-official-engines-runtime.md)); Thales wants to
start at no cost, keep data in Brazil and move to paid plans later without lock-in.

## Options considered

1. **Oracle Cloud Always Free VM (Ampere A1, 2 OCPU, 12 GB, São Paulo):** free with no time limit,
   always on (no cold starts), room for staging and production, individual accounts with a card.
   Costs: a self-managed server, Arm images, possible idle reclaim (removed by Pay As You Go), limits
   already cut once in 2026, capacity not guaranteed when creating the VM.
2. **Fly.io with auto-stop + Supabase:** managed, accepts personal cards, a few US dollars a month
   during the beta. No real free plan.
3. **Wait for a CNPJ and keep Cloud Run:** blocks deploys and previews until then.

## Decision

Option 1 for staging and beta:

| Layer | Choice |
|---|---|
| API and engines | One Oracle Always Free VM (Ubuntu 24.04 aarch64, VM.Standard.A1.Flex 2 OCPU / 12 GB) in São Paulo, running `docker compose` (API, two engines on an internal network) behind Caddy for HTTPS |
| Database | Supabase free, `sa-east-1` (Pro with daily backups before real client data) |
| Web | Cloudflare with PR previews (ADR 001) |
| Deploy | CI publishes tested images to GHCR, then a deploy job connects over SSH as a restricted `deploy` user and runs `docker compose pull && up -d` |

The tenancy is upgraded to Pay As You Go from day one, with a US$ 1 budget alert: Always Free
resources stay free and the instance is no longer subject to idle reclaim. Cloud Run (ADR 007) is the
planned destination once a CNPJ exists; Fly.io is the fallback if Oracle capacity or limits change.

**Portability rule (kept from ADR 007):** no provider-specific feature enters the code without an
ADR. Provider specifics live only in deploy configuration.

## Consequences

- **Arm images:** `image.yml` and `engine-images.yml` build `linux/arm64` (native GitHub Arm runners,
  free for public repositories) in addition to `linux/amd64`, published as multi-platform images.
- **Server hardening (EST-03.1/03.2):** SSH by key only from the owner's IP, `fail2ban`, unattended
  security upgrades, Ubuntu `iptables` opened only for 80/443, Docker with the engines on an internal
  network and the memory limits of `engines/compose.yml`.
- **Single server:** no automatic failover. Uptime monitoring and alerts (EST-03.3) and a documented
  rebuild procedure (EST-03.4) are mandatory before the beta.
- **Secrets:** stored in GitHub environment secrets (deploy key, host) and in a root-only `.env` on the
  VM; never in the repository.
- **Database connection:** unchanged from ADR 007 (Supabase pooler in transaction mode for the API,
  direct connection for migrations, login user member of `trs_app`).
- **Rate limiting:** still in memory per process; moves to Postgres or Redis before production.
- **Moving later:** the same images and compose files run on Cloud Run, Fly.io or any VPS; a move is
  about a day of deploy and DNS work, with no downtime.

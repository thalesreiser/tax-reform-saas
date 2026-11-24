# 007 - Hosting: Cloud Run for the API and engines, Supabase for Postgres

- **Status:** superseded by [008](008-hosting-oracle-always-free.md) (Google Cloud billing in Brazil requires a CNPJ, which the project does not have yet)
- **Date:** 2026-11-23
- **Decided by:** Thales Reiser
- **Reference:** DEC-01, EST-03.1, EST-03.2; supersedes the "Postgres (Neon)" and "container host" rows of
  [ADR 001](001-stack.md)

## Context

The API (Node) and the two official engines (JVM) run as containers. Under a real 768 MB limit the
engines peak at 475 MB (regime regular) and 436 MB (Simples Nacional) and take about 25 s to become
healthy ([ADR 004](004-official-engines-runtime.md)); the whole backend needs about 2.5 GB of RAM.
Thales wants to start at no cost and move to paid plans when real client data arrives, without being
locked to a provider. Data should stay in Brazil (latency, LGPD). Builds and deploys run only in CI.

## Options considered

1. **Google Cloud Run + Supabase (São Paulo):** managed containers with a monthly free allowance,
   scale to zero, private services; Supabase Postgres free plan in `sa-east-1`. Upgrade is a setting
   (minimum instances, Supabase Pro). Cost: the engines' cold start (15-25 s) while scaled to zero.
2. **Oracle Cloud Always Free VM (2 Arm cores, 12 GB) with docker compose:** always on and free, but
   a single self-managed server, Arm images, idle-instance reclaim and limits already cut once in 2026.
3. **Fly.io, Railway or a VPS (Magalu, Lightsail):** good paid options from about US$ 25-30 per month;
   no free plan large enough for the engines.
4. **Render or Koyeb free tiers:** 512 MB and no private networking on the free plan; ruled out.

## Decision

Option 1, for staging and beta, with this path to production:

| Layer | Staging / beta (free) | Production (before real client data) |
|---|---|---|
| API | Cloud Run, `southamerica-east1`, scale to zero | Cloud Run, minimum 1 instance |
| Engines | Cloud Run, internal only, scale to zero | Cloud Run, minimum 1 instance each, 768 MB |
| Database | Supabase free, `sa-east-1` | Supabase Pro (daily backups) |
| Web | Cloudflare with PR previews (ADR 001) | Cloudflare |

Option 2 (Oracle) was not adopted; it can be revisited if production costs on Cloud Run are too high.

**Portability rule:** no provider-specific feature (queues, storage, service-to-service auth, managed
caches, Supabase Auth or its auto-generated APIs) enters the code without an ADR. Provider specifics
live only in deploy configuration.

## Consequences

- **Images:** Cloud Run pulls from Artifact Registry, not from GHCR. EST-03.2 sets up an Artifact
  Registry remote repository that proxies GHCR (or pushes the tested images there from CI); GHCR stays
  the source of truth.
- **Private engines:** engines use internal ingress; the API reaches them through Direct VPC egress.
  Requiring an IAM invoker token is an extra layer kept in the deploy configuration only; the engine
  client keeps plain base URLs (`packages/engine-client`).
- **Database:** the API connects through the Supabase transaction pooler (port 6543); `withOffice`
  uses `set_config(..., true)` inside the transaction, which works in that mode (confirm in staging).
  Migrations use the direct connection with the owner role; the API uses a login user that is a member
  of `trs_app` (BE-01.2). Supabase Auth and its REST/GraphQL APIs are not used.
- **Free plan limits to watch:** Supabase pauses a free project after 7 days without activity and has
  no automatic backups; Cloud Run's free allowance is priced on `us-central1` and may not fully apply
  in São Paulo. A budget alert is set on day one, and the first monthly bill is reviewed.
- **Cold starts:** with zero minimum instances the first calculation after idle waits for the engine
  (about 25 s). Acceptable in staging and beta; the API shows a clear "warming up" state and retries
  GET calls only (POST calculations are never retried, MOT-01.3).
- **Rate limiting:** the in-memory login limiter (BE-01.3) is per instance; it moves to Postgres or
  Redis before production or before running more than one API instance.
- **Moving later:** images, environment-variable configuration, `engines/compose.yml` and plain
  Postgres keep a move to another host to about a day of deploy and DNS work, with no downtime
  (bring up the new host, test, switch DNS).
- **EST-03.1 (manual, Thales):** Google Cloud project with billing and a budget alert, Supabase project
  in `sa-east-1`, Cloudflare, domain, and secrets in each host's secret store (never in the repository).

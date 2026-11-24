# Deploy

Staging runs on Fly.io (region `gru`, São Paulo) with Postgres on Supabase (`sa-east-1`), as decided
in ADR 008. Every push to `develop` that passes CI is deployed by
`.github/workflows/deploy-staging.yml`; it can also be started by hand (Actions, "Deploy staging",
on `develop`). Production is not configured yet.

## Topology

| Fly app         | What                             | Reachable at                        | VM                  |
| --------------- | -------------------------------- | ----------------------------------- | ------------------- |
| `trs-tax-api`   | The API (`apps/api/Dockerfile`)  | `https://trs-tax-api.fly.dev`       | shared-cpu-1x 512MB |
| `trs-engine-rr` | Official regime-regular engine   | `http://trs-engine-rr.flycast:8080` | shared-cpu-1x 768MB |
| `trs-engine-sn` | Official Simples Nacional engine | `http://trs-engine-sn.flycast:8082` | shared-cpu-1x 768MB |

Configuration: `deploy/fly/*.toml`. Every app stops its machine when idle and starts it on the next
request (`min_machines_running = 0`).

- **Private engines.** The engines have no public IP: only a Flycast address (private IPv6), so only
  apps in the same Fly organization reach them. Flycast goes through the Fly proxy, which starts a
  stopped machine; a `.internal` address would not. The workflow allocates the Flycast address if
  missing, deploys with `--no-public-ips` and fails if any public address exists.
- **Cold starts.** The API starts in a few seconds; an engine takes about 25 s or more (ADR 004), so
  the first calculation after idle is slow. The engine health check (`/health` on the management
  port, 9101 or 9103) has a 90 s grace period.
- **Client address.** `TRUST_PROXY_HOPS=1` makes the API trust the one `X-Forwarded-For` entry
  appended by Fly's proxy, so rate limits key on the real client address.

## Pipeline

1. **migrate:** builds `@trs/api` and runs `db:migrate` with `DATABASE_MIGRATION_URL`.
2. **engines** (in parallel): copies the image tested and published by `engine-images.yml`
   (`ghcr.io/thalesreiser/trs-engine-*:<tag from engines/versions.env>`) to
   `registry.fly.io/<app>:<tag>` and deploys it. A tag bump is deployed once its image is on GHCR;
   if the deploy ran first, start the workflow again by hand.
3. **api** (after migrate): builds the API image for `linux/amd64`, pushes
   `registry.fly.io/trs-tax-api:<git sha>`, deploys it with `APP_VERSION=<git sha>` and checks
   `GET /health` (up to 90 s, for a cold start). **Skipped until the repository variable
   `API_DATABASE_READY` is `true`**, which is set after `DATABASE_URL` exists (below).

## Secrets

| Secret                   | Where                        | What                                       |
| ------------------------ | ---------------------------- | ------------------------------------------ |
| `DATABASE_MIGRATION_URL` | GitHub environment `staging` | Supabase session pooler (5432), owner role |
| `FLY_TOKEN_API`          | GitHub environment `staging` | Deploy token of `trs-tax-api`              |
| `FLY_TOKEN_ENGINE_RR`    | GitHub environment `staging` | Deploy token of `trs-engine-rr`            |
| `FLY_TOKEN_ENGINE_SN`    | GitHub environment `staging` | Deploy token of `trs-engine-sn`            |
| `DATABASE_URL`           | Fly secret on `trs-tax-api`  | Transaction pooler (6543), `trs_api` user  |
| `BETTER_AUTH_SECRET`     | Fly secret on `trs-tax-api`  | Session signing secret                     |
| `BETTER_AUTH_URL`        | Fly secret on `trs-tax-api`  | `https://trs-tax-api.fly.dev`              |

Non-secret settings are in the `[env]` of each `.toml`. Never use the direct `db.<ref>.supabase.co`
host from CI: it is IPv6 only. Never paste a connection string in a chat, issue or log.

## One-time set-up of the API database user

After the first successful `migrate` job (it creates the `trs_app` role):

1. In the Supabase SQL editor, create the API's login user, with a long random password of your
   choice (for example `openssl rand -hex 32`). It is a member of `trs_app`, never superuser and
   never owner, so row-level security applies (see `apps/api/README.md`, Database):

   ```sql
   CREATE ROLE trs_api LOGIN PASSWORD '<choose>';
   GRANT trs_app TO trs_api;
   ```

2. Set `DATABASE_URL` on Fly with the **transaction pooler** (port 6543). Through the pooler the user
   name is `trs_api.<project ref>`. Type it into a hidden prompt rather than a command line, so it
   stays out of the shell history:

   ```sh
   read -rs DATABASE_URL   # postgres://trs_api.<ref>:<password>@<pooler host>:6543/postgres
   printf 'DATABASE_URL=%s\n' "$DATABASE_URL" | fly secrets import --app trs-tax-api --stage
   unset DATABASE_URL
   ```

3. Set the repository (or `staging` environment) variable `API_DATABASE_READY` to `true` and start
   "Deploy staging" by hand on `develop`.

## Observability

Errors go to Sentry, logs stay with each host, and uptime alerts are GitHub issues (EST-03.3).

### Errors (Sentry)

Error tracking is **off until a DSN is set**; without one the SDKs are not started and nothing is
sent. Once a Sentry project exists (free Developer plan), set:

- **API:** `SENTRY_DSN` as a Fly secret, typed into a hidden prompt:
  `read -rs SENTRY_DSN; printf 'SENTRY_DSN=%s
' "$SENTRY_DSN" | fly secrets import --app trs-tax-api; unset SENTRY_DSN`.
  `SENTRY_ENVIRONMENT=staging` is in `api.toml`; the release is `APP_VERSION` (the git sha).
  Performance tracing stays off (`SENTRY_TRACES_SAMPLE_RATE=0`) unless decided otherwise.
- **Web:** `NUXT_PUBLIC_SENTRY_DSN` in the Cloudflare dashboard (Workers, `trs-web`, Settings,
  Variables and secrets) for the production and preview builds. A DSN is public by design: it only
  lets clients send events.

What is sent: API 5xx and unhandled errors only (4xx are expected), tagged with `request_id` (the
`x-request-id` header and the `requestId` of the problem details), the route pattern, the method and
a one-way hash of the office id. Web browser and Worker errors, without session replay. Every event
passes a scrubber (`apps/api/src/sentry.ts`, `apps/web/shared/utils/sentry-scrub.ts`) that drops
headers, cookies, query strings, bodies, form values, user data and breadcrumbs, and masks CNPJ, CPF
and e-mail addresses in messages. With a DSN, the browser sends only to the ingest host in that
DSN (`o<id>.ingest.sentry.io`); the SDK itself is a chunk served by the app.

To find the error behind a support request, search Sentry for `request_id:<id>`.

### Logs

- **API:** JSON lines (pino) with `reqId`, `req.method`, `req.route` (the route pattern, never the
  URL or query string), `res.statusCode` and `responseTime` (ms); credentials are redacted.
  Read them with `fly logs --app trs-tax-api` (live) or in the Fly dashboard (Monitoring). Filter
  one request with `fly logs --app trs-tax-api | grep <request id>`.
- **Engines:** `fly logs --app trs-engine-rr` / `trs-engine-sn`.
- **Web:** Workers observability is enabled in `apps/web/wrangler.jsonc`; logs are in the Cloudflare
  dashboard (Workers, `trs-web`, Observability) or live with `wrangler tail trs-web`.

### Uptime

`.github/workflows/uptime.yml` runs every 30 minutes (and by hand). It requests the web home and the
API `/health`, retrying for about a minute to cover a cold start. When either is down the job fails
and opens one issue labelled `uptime` (later failures comment on it); the first good run closes it.
GitHub e-mails the failure to watchers. Scheduled workflows run only on the default branch and may
start a few minutes late. Inside Fly, the `/health` check in `api.toml` restarts a broken machine.

**Cost.** Each API ping starts the stopped machine, which stops again after a few idle minutes:
about 48 pings x ~5 min = ~4 h/day, ~120 h/month of a shared-cpu-1x 512MB (about US$ 0.0044/h), so
roughly US$ 0.55/month of the US$ 5 allowance. The engines are not woken (`/health` does not call
them). Every 15 minutes would double this and keep the machine up a third of the time; pinging only
the web would cost nothing but miss API outages. An external uptime service is a later option.

## Rollback

- List releases and their images: `fly releases --app <app> --image`.
- Deploy a previous image again: `fly deploy --config deploy/fly/<file>.toml --app <app> --image
registry.fly.io/<app>:<previous tag or sha>` (add `--env APP_VERSION=<sha>` for the API).
- Migrations are not rolled back automatically: a bad migration is fixed by a new one.

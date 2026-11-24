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

## Rollback

- List releases and their images: `fly releases --app <app> --image`.
- Deploy a previous image again: `fly deploy --config deploy/fly/<file>.toml --app <app> --image
registry.fly.io/<app>:<previous tag or sha>` (add `--env APP_VERSION=<sha>` for the API).
- Migrations are not rolled back automatically: a bad migration is fixed by a new one.

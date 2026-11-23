# Official engines

The CBS, IBS and IS values come from the Receita Federal engines (MIT), run **unmodified** and
**pinned to a release tag** ([ADR 001](../docs/adr/001-stack.md),
[ADR 004](../docs/adr/004-official-engines-runtime.md)):

| Engine           | Upstream                                                                                               | HTTP                           | Health         |
| ---------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------ | -------------- |
| Regime regular   | [calculadora-rtc-regime-regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular)     | `:8080/api/calculadora/...`    | `:9101/health` |
| Simples Nacional | [calculadora-rtc-simples-nacional](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional) | `:8082/api/...`, `/api/versao` | `:9103/health` |

Swagger: `/api/swagger-ui.html` on each HTTP port.

## Layout

- `versions.env`: the single source of the pinned tags, with the commit each tag points to.
- `fixtures/<engine>/request.json`: an official upstream example, copied as published
  (only reformatted by Prettier, which writes `100.00` as `100.0`).
- `fixtures/<engine>/case.json`: the endpoint and the expected values (`jq` filter to value).
- `scripts/smoke.sh`: starts a built jar, measures start-up time and memory, posts the example and
  checks the values.

## How CI builds them

`.github/workflows/engines.yml` runs on changes to this folder, weekly and on demand. For each engine:

1. Checks out the upstream repository at the pinned commit (and fails if the tag moved).
2. Generates the read-only SQLite database with Flyway from the **regime-regular** checkout:
   `./mvnw flyway:migrate -Dflyway.configFiles=./flyway/flyway-pro.conf`. The Simples repository
   has no `flyway/` folder; its README says to use the regime-regular scripts, so it gets a copy of
   the same database file (`calculadora/db/calculadora-pro.db`).
3. Builds the jar with `./mvnw package -DskipTests` on Temurin 25. The Maven wrapper downloads
   Maven and all dependencies from Maven Central, so the build needs internet access.
4. Starts the jar with `-Dspring.profiles.active=offline` from the checkout root (the profile reads
   `./calculadora/db`), waits for `/health`, posts the fixture and checks the expected values, with
   default JVM options and with two 512 MB container sizings (see ADR 004).
5. Writes build time, start-up time and memory to the job summary and uploads the jar, the database
   and the logs as artifacts.

## Bumping a tag

Update the tag and its commit SHA together in `versions.env`
(`gh api repos/<repo>/commits/<tag> --jq .sha`), then check the upstream `CHANGELOG.md` and
`docs/exemplos.md`: if the official example changed, update the fixture from upstream, never to make
CI pass.

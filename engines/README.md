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
- `scripts/check-pins.sh`: fails if a pinned tag no longer points to its pinned commit.
- `Dockerfile`, `compose.yml`, `compose.ci.yml`, `scripts/container-smoke.sh`: the container images
  (below).

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

## Container images

`.github/workflows/engine-images.yml` builds one image per engine with `Dockerfile` (MOT-01.2):

| Image                                              | Tag                           | HTTP   | Management (`/health`) | Version endpoint                        |
| -------------------------------------------------- | ----------------------------- | ------ | ---------------------- | --------------------------------------- |
| `ghcr.io/thalesreiser/trs-engine-regime-regular`   | `1.7.2`, `1.7.2-<our commit>` | `8080` | `9101`                 | `/api/calculadora/dados-abertos/versao` |
| `ghcr.io/thalesreiser/trs-engine-simples-nacional` | `1.0.2`, `1.0.2-<our commit>` | `8082` | `9103`                 | `/api/versao`                           |

- Build stage (Temurin JDK 25, pinned by digest): Flyway database from the regime-regular checkout
  and `mvnw package -DskipTests` from the engine checkout, both passed as build contexts at the
  pinned commit. Runtime stage (Temurin JRE 25, pinned by digest): non-root user `engine`
  (uid 10001), the jar and the database owned by root and read-only, offline profile.
- JVM options in `JDK_JAVA_OPTIONS`: `-XX:MaxRAMPercentage=75 -XX:+UseSerialGC -Xss512k
-XX:+ExitOnOutOfMemoryError`, so the heap follows the container limit. Override the variable to
  change them (for example the C1-only flags of ADR 004).
- The Docker health check calls the engine's own `/health` on the management port with bash only
  (no curl in the image), with a 90 s start period.
- The version endpoint returns `versaoApp` (the release tag) and `versaoDb` (the database version).

Run both engines (CI and staging):

```sh
docker compose -f engines/compose.yml --env-file engines/versions.env up --detach --wait
```

`compose.yml` gives each engine a real limit of **768 MB without swap**, a read-only root file
system with a 64 MB `/tmp` tmpfs (mounted `exec`: the SQLite driver loads its native library from it), no capabilities, and the internal network `trs-engines`: no
published ports (Swagger stays private) and no internet access. Our API joins that network and calls
`http://regime-regular:8080` and `http://simples-nacional:8082`. CI adds `compose.ci.yml`, which
publishes the ports on the runner's loopback only, then runs `scripts/container-smoke.sh` (version
endpoint, official example, 200 more requests, memory peak under the limit) and a Trivy scan that
fails on critical vulnerabilities. Pushes to `develop` and `main` publish the tested images.

## Bumping a tag

Update the tag and its commit SHA together in `versions.env`
(`gh api repos/<repo>/commits/<tag> --jq .sha`), then check the upstream `CHANGELOG.md` and
`docs/exemplos.md`: if the official example changed, update the fixture from upstream, never to make
CI pass.

## Golden contract tests

`fixtures/contract/<engine>/<case>/` holds every upstream example we check against the running
containers (MOT-01.5, RNF-06): the `docs/exemplos.md` examples, the OpenAPI `EXEMPLO_*` requests and
the upstream integration tests that assert values, all at the pinned tags. Each case has:

- `request.json`: the upstream request, as published or as the upstream test builds it.
- `expected.json`: `endpoint`, HTTP `status` and `values`, a map from a path in the raw response
  (`.objetos[3].erros[0].code`) to the value upstream asserts, as text. Decimals are compared by
  decimal equality (never as floats); `null` means absent or null; a list means the same texts in any order.
- `source.md`: the upstream file, line, test name and tag the values come from.

`packages/engine-client/tests/engines/contract.test.ts` runs every case through the client in the
`test:engines` step of `engine-images.yml` (on changes here or in the client, and weekly) and prints
a per-case diff on failure.

To add a case: create the folder with the three files, assert only what the upstream example or test
asserts, and link the exact source. A value without an upstream source does not belong here, and neither does an upstream test marked
`@Disabled` (for example `Teste_510002_1` and `Teste_620001_1` at 1.7.2: the engine answers 404 and
422 for them).

**A contract test failing after a tag bump** means the engine changed its results. Read the upstream
`CHANGELOG.md` and the changed example or test first; update `expected.json` only to what upstream
now publishes, citing the new source in `source.md`. Never edit an expectation just to make CI pass.

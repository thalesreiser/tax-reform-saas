# @trs/engine-client

Typed client of the official Receita Federal engines ([ADR 001](../../docs/adr/001-stack.md),
[ADR 004](../../docs/adr/004-official-engines-runtime.md)). Every CBS, IBS and IS value comes from the
engines through this package; nothing else calls them.

| Engine           | Client                          | Pinned tag (`engines/versions.env`) |
| ---------------- | ------------------------------- | ----------------------------------- |
| Regime regular   | `createRegimeRegularClient()`   | `REGIME_REGULAR_TAG`                |
| Simples Nacional | `createSimplesNacionalClient()` | `SIMPLES_NACIONAL_TAG`              |

```ts
import { createRegimeRegularClient } from "@trs/engine-client"

const engine = createRegimeRegularClient({
  baseUrl: "http://regime-regular:8080",
  timeoutMs: 5_000,
})
const result = await engine.calculateRegimeGeralWithObservability(operation)
if (!result.ok) return result.error // { kind: "problem" | "http" | "timeout" | "network" | "invalid-response", ... }
for (const item of result.value.items) {
  if (item.status === "calculated")
    item.tribCalc?.IBSCBS?.gIBSCBS?.gCBS?.vCBS // Decimal
  else item.errors // [{ code: "REG-011", pointer: "#/itens/3/ncm", title, detail }]
}
```

## Functions

- Regime regular: `calculateRegimeGeral`, `calculateRegimeGeralWithObservability`, `generateXml`,
  `validateXml`, `getVersion`, `getErrorDescription`, `getAliquotaUniao`, `getAliquotaUf`,
  `getAliquotaMunicipio`, `getClassificacaoTributaria`, `listSituacoesTributarias`,
  `listFundamentacoesLegais`, `getNcm`, `listNcm`, `getNbs`, `listNbs`.
- Simples Nacional: `calculateSimplesNacional` (the unassisted endpoint; the per-item-rate one is
  obsolete upstream), `getVersion`, `getErrorDescription`, `listAtividades`.
- `RegimeRegularApi` and `SimplesNacionalApi` export the raw generated types (`paths`, `components`).

## Behaviour

- **Results, not exceptions.** Every function resolves to `{ ok: true, value }` or
  `{ ok: false, error }`; it never throws. Item errors of the observability endpoints
  (`INCONSISTENCIA_ENTRADA` with `REG-011`, ...) are items with `status: "not-calculated"` and
  `errors`, while the other items are still calculated.
- **Errors.** HTTP 4xx/5xx with a problem details body (RFC 9457) become `kind: "problem"` with
  `status`, `title`, `detail`, `errors[]` (`code`, `pointer`, `title`, `detail`, `type`) and `code`,
  the first catalogued code (`REG-`, `CAL-`, `VAL-`, `VSN-`). Other HTTP errors are `kind: "http"`.
  Timeouts (`kind: "timeout"`) and transport failures (`kind: "network"`) are distinct. A 2xx body off
  the contract is `kind: "invalid-response"`; its message never quotes the body.
- **Decimals.** The engines send BigDecimal as JSON strings (`"42.24"`) but declare it as `number` in
  their OpenAPI documents. The generator types those fields as `DecimalText` and records where they
  are; the client turns exactly them into `Decimal` with `dec()` from `@trs/tax-legacy`
  ([ADR 003](../../docs/adr/003-current-tax-engine-model.md)). A field sent as a JSON number is
  accepted only up to 15 significant digits (exact in a double); anything else is rejected, never
  approximated. Fields the engines declare as text (e.g. Simples `pCBSSN` in requests and in
  `resolucaoAliquotas`) stay text. In requests, decimal fields take a `Decimal` or its text and are
  sent as plain text.
- **Timeouts and retries.** `timeoutMs` (default 10 s) covers the whole call; `signal` cancels one.
  POST calls are never retried. GET calls are retried `getRetries` times (default 0) after a network
  error, a timeout or an HTTP 5xx.
- **Base URL.** The engine root (`http://regime-regular:8080`); the client adds the `/api` context
  path. On the `trs-engines` network the engines are `regime-regular:8080` and
  `simples-nacional:8082` (`engines/compose.yml`).

## OpenAPI documents and generated code

`openapi/<engine>.json` is the engine's `/api/api-docs` at the pinned tag, with `servers` removed and
keys sorted (`jq -S 'del(.servers)'`). `pnpm generate` (`scripts/generate.mjs`, openapi-typescript)
writes `src/generated/<engine>.ts` (types) and `src/generated/<engine>-decimals.ts` (where the decimal
fields are). Neither folder is formatted or linted.

The engine-images workflow downloads both documents from the running containers and fails if they
differ from the committed copies (the fetched files and the diff are in the `engine-openapi`
artifact), regenerates the code and fails if it changed, then runs `pnpm test:engines` against the
containers. After a tag bump: copy the documents from the artifact, run `pnpm generate`, commit.

## Tests

- `pnpm test`: unit tests with a mocked `fetch`, using the official examples in `engines/fixtures/` and
  the engines' recorded answers in `tests/fixtures/`.
- `pnpm test:engines`: the same examples against running engines, asserting the values of
  `engines/fixtures/*/case.json` through the client. Needs `ENGINE_REGIME_REGULAR_URL` and
  `ENGINE_SIMPLES_NACIONAL_URL`; runs in CI only (`.github/workflows/engine-images.yml`).

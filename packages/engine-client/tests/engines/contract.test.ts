// Golden contract tests (MOT-01.5, RNF-06): every case under engines/fixtures/contract/<engine>/<case>/
// is an example or test published upstream at the pinned tag (see its source.md). The request goes
// through the client to the running engine, and each value of expected.json must match: decimals by
// decimal equality (to the cent and beyond, never as floats), everything else as text.
import { readdir, readFile } from "node:fs/promises"
import { dec, Fiscal } from "@trs/tax-legacy"
import { describe, expect, it } from "vitest"
import { decimalize, type DecimalShapes } from "../../src/decimals.js"
import { decimalShapes as regimeRegularShapes } from "../../src/generated/regime-regular-decimals.js"
import { decimalShapes as simplesNacionalShapes } from "../../src/generated/simples-nacional-decimals.js"
import {
  createRegimeRegularClient,
  createSimplesNacionalClient,
  type EngineResult,
  type RegimeGeralInput,
  type SimplesNacionalInput,
} from "../../src/index.js"

interface Expected {
  endpoint: string
  status: number
  /** Path in the raw response (`.objetos[2].erros[0].code`) to its value; `null`: absent or null. */
  values: Record<string, string | null>
}

/** What one call returned: the client's result and the raw response the engine sent. */
interface Outcome {
  result: EngineResult<unknown> | undefined
  status: number
  body: unknown
}

const contract = new URL("../../../../engines/fixtures/contract/", import.meta.url)

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

/** A fetch that keeps a copy of the last response, so the raw body can be compared. */
function recordingFetch() {
  let last: Response | undefined
  return {
    fetch: async (request: Request) => {
      const response = await globalThis.fetch(request)
      last = response.clone()
      return response
    },
    async read(): Promise<{ status: number; body: unknown }> {
      if (!last) throw new Error("no response was recorded")
      const text = await last.text()
      return { status: last.status, body: text ? (JSON.parse(text) as unknown) : undefined }
    },
  }
}

type Endpoint = (request: unknown) => Promise<Outcome>

function endpoints(): Record<string, Endpoint> {
  const regimeRegular = env("ENGINE_REGIME_REGULAR_URL")
  const simplesNacional = env("ENGINE_SIMPLES_NACIONAL_URL")

  // Calls the engine through the client, then reads the raw body with the client's decimal parsing.
  const viaClient =
    (
      send: (fetch: (request: Request) => Promise<Response>, input: unknown) => Promise<unknown>,
      shapes: DecimalShapes,
      ref: string,
    ): Endpoint =>
    async (input) => {
      const recorder = recordingFetch()
      const result = (await send(recorder.fetch, input)) as EngineResult<unknown>
      const { status, body } = await recorder.read()
      const parsed = status < 300 ? decimalize(body, { ref }, shapes) : body
      return { result, status, body: parsed }
    }

  return {
    "regime-regular/observabilidade": viaClient(
      (fetch, input) =>
        createRegimeRegularClient({
          baseUrl: regimeRegular,
          fetch,
        }).calculateRegimeGeralWithObservability(input as RegimeGeralInput),
      regimeRegularShapes,
      "ObservabilidadeROCDomain",
    ),
    "regime-regular/regime-geral": viaClient(
      (fetch, input) =>
        createRegimeRegularClient({ baseUrl: regimeRegular, fetch }).calculateRegimeGeral(
          input as RegimeGeralInput,
        ),
      regimeRegularShapes,
      "ROCDomain",
    ),
    // Not wrapped by the client (no consumer yet): same parsing, plain request.
    "regime-regular/base-calculo-unificada": async (input) => {
      const response = await fetch(
        `${regimeRegular}/api/calculadora/base-calculo/base-calculo-unificada`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      )
      const body = (await response.json()) as unknown
      const parsed = response.ok
        ? decimalize(body, { ref: "BaseCalculoUnificadaOutput" }, regimeRegularShapes)
        : body
      return { result: undefined, status: response.status, body: parsed }
    },
    "simples-nacional/nao-assistido": viaClient(
      (fetch, input) =>
        createSimplesNacionalClient({ baseUrl: simplesNacional, fetch }).calculateSimplesNacional(
          input as SimplesNacionalInput,
        ),
      simplesNacionalShapes,
      "ObservabilidadeSimplesDomain",
    ),
  }
}

/** `.objetos[2].erros[0].code` → `["objetos", "2", "erros", "0", "code"]`. */
function lookup(value: unknown, path: string): unknown {
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .reduce<unknown>(
      (node, key) =>
        node !== null && typeof node === "object"
          ? (node as Record<string, unknown>)[key]
          : undefined,
      value,
    )
}

function asDecimal(text: string) {
  try {
    return dec(text)
  } catch {
    return undefined
  }
}

/** Empty when the actual value matches; otherwise a readable line for the diff. */
function compare(path: string, expected: string | null, actual: unknown): string | undefined {
  const shown = Fiscal.isDecimal(actual) ? actual.toFixed() : JSON.stringify(actual)
  const line = `  ${path}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${shown}`
  if (expected === null) return actual === null || actual === undefined ? undefined : line
  if (Fiscal.isDecimal(actual)) {
    const wanted = asDecimal(expected)
    return wanted?.eq(actual) ? undefined : line
  }
  return typeof actual === "string" && actual === expected ? undefined : line
}

async function readCases(engine: string) {
  const dir = new URL(`${engine}/`, contract)
  const names = (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  return Promise.all(
    names.map(async (name) => {
      const read = async (file: string) =>
        JSON.parse(await readFile(new URL(`${name}/${file}`, dir), "utf8")) as unknown
      return {
        name,
        request: await read("request.json"),
        expected: (await read("expected.json")) as Expected,
      }
    }),
  )
}

const calls = endpoints()

for (const engine of ["regime-regular", "simples-nacional"]) {
  const cases = await readCases(engine)

  describe(`${engine} contract (${cases.length} upstream cases)`, () => {
    it("has cases", () => {
      expect(cases.length).toBeGreaterThan(0)
    })

    for (const { name, request, expected } of cases) {
      it(name, async () => {
        const call = calls[expected.endpoint]
        if (!call) throw new Error(`${name}: unknown endpoint ${expected.endpoint}`)
        const outcome = await call(request)

        const problems: string[] = []
        if (outcome.status !== expected.status) {
          problems.push(
            `  HTTP status\n    expected: ${expected.status}\n    actual:   ${outcome.status}`,
          )
        }
        // The client must classify the outcome the same way: a value for 2xx, a problem otherwise.
        if (outcome.result && outcome.result.ok !== expected.status < 300) {
          problems.push(`  client result\n    ok: ${outcome.result.ok} for HTTP ${outcome.status}`)
        }
        for (const [path, value] of Object.entries(expected.values)) {
          const problem = compare(path, value, lookup(outcome.body, path))
          if (problem) problems.push(problem)
        }
        if (problems.length > 0) {
          throw new Error(
            `${engine}/${name} differs from upstream (see its source.md):\n${problems.join("\n")}`,
          )
        }
      })
    }
  })
}

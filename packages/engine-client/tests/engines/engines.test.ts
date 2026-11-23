// Runs against both engine containers (engine-images workflow): the official examples must come
// back through the client with the values in engines/fixtures/*/case.json.
import { readFile } from "node:fs/promises"
import { dec, Fiscal } from "@trs/tax-legacy"
import { describe, expect, it } from "vitest"
import {
  createRegimeRegularClient,
  createSimplesNacionalClient,
  type RegimeGeralInput,
  type SimplesNacionalInput,
} from "../../src/index.js"

const fixtures = new URL("../../../../engines/fixtures/", import.meta.url)
const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(new URL(path, fixtures), "utf8")) as unknown

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const versions = Object.fromEntries(
  (await readFile(new URL("../versions.env", fixtures), "utf8"))
    .split("\n")
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => line.split("=") as [string, string]),
)

/**
 * Every `checks` entry of a case.json, read through the client's value. The filters address the raw
 * response (`.objetos[2].erros[0].code`); the client exposes `objetos` as `items` and `erros` as
 * `errors`, one for one.
 */
async function expectChecks(engine: string, value: unknown) {
  const { checks } = (await readJson(`${engine}/case.json`)) as { checks: Record<string, string> }
  for (const [filter, expected] of Object.entries(checks)) {
    const path = filter
      .replace(/^\.objetos\[/, ".items[")
      .replace(".erros[", ".errors[")
      .replace(/\[(\d+)\]/g, ".$1")
      .split(".")
      .filter(Boolean)
    const actual = path.reduce<unknown>(
      (node, key) => (node as Record<string, unknown> | undefined)?.[key],
      value,
    )
    const text = Fiscal.isDecimal(actual)
      ? actual.toFixed(expected.split(".")[1]?.length ?? 0)
      : actual
    expect(text, filter).toBe(expected)
  }
}

describe("regime-regular engine", () => {
  const client = createRegimeRegularClient({ baseUrl: env("ENGINE_REGIME_REGULAR_URL") })

  it("reports the pinned tag", async () => {
    const result = await client.getVersion()
    expect(result).toMatchObject({ ok: true, value: { versaoApp: versions.REGIME_REGULAR_TAG } })
  })

  it("returns the official example values, with decimals sent as text", async () => {
    const request = (await readJson("regime-regular/request.json")) as RegimeGeralInput
    // The same example with every amount and rate as a Decimal: the client sends them as strings.
    const input: RegimeGeralInput = {
      ...request,
      itens: request.itens?.map((item) => ({
        ...item,
        ...(item.baseCalculo === undefined ? {} : { baseCalculo: dec(String(item.baseCalculo)) }),
      })),
    }
    const result = await client.calculateRegimeGeralWithObservability(input)
    if (!result.ok) throw new Error(JSON.stringify(result.error))

    await expectChecks("regime-regular", result.value)
    const item4 = result.value.items[3]
    expect(item4?.status).toBe("not-calculated")
  })
})

describe("simples-nacional engine", () => {
  const client = createSimplesNacionalClient({ baseUrl: env("ENGINE_SIMPLES_NACIONAL_URL") })

  it("reports the pinned tag", async () => {
    const result = await client.getVersion()
    expect(result).toMatchObject({ ok: true, value: { versaoApp: versions.SIMPLES_NACIONAL_TAG } })
  })

  it("returns the official example values", async () => {
    const request = (await readJson("simples-nacional/request.json")) as SimplesNacionalInput
    const result = await client.calculateSimplesNacional(request)
    if (!result.ok) throw new Error(JSON.stringify(result.error))

    await expectChecks("simples-nacional", result.value)
  })

  it("returns a VSN code for an invalid call", async () => {
    const request = (await readJson("simples-nacional/request.json")) as SimplesNacionalInput
    const result = await client.calculateSimplesNacional({ ...request, itens: [] })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatchObject({ kind: "problem", status: 422 })
    if (result.error.kind !== "problem") return
    expect(result.error.code).toMatch(/^VSN-\d{3}$/)
  })
})

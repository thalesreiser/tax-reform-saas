import { dec } from "@trs/tax-legacy"
import { describe, expect, it } from "vitest"
import {
  createRegimeRegularClient,
  type RegimeGeralInput,
  type RegimeGeralItem,
} from "../src/index.js"
import { hangingFetch, jsonResponse, mockFetch, readJson, sentRequest } from "./helpers.js"

// Official upstream example (docs/exemplos.md, 1.7.2) and the engine's recorded answer to it.
const request = (await readJson(
  "../../../engines/fixtures/regime-regular/request.json",
)) as RegimeGeralInput
const recorded = await readJson("./fixtures/regime-regular-observability.json")

const BASE_URL = "http://regime-regular:8080/"

function client(fetch: (request: Request) => Promise<Response>, getRetries = 0) {
  return createRegimeRegularClient({ baseUrl: BASE_URL, fetch, timeoutMs: 50, getRetries })
}

function calculated(item: RegimeGeralItem | undefined) {
  if (item?.status !== "calculated") throw new Error(`item not calculated: ${item?.status}`)
  return item
}

describe("calculateRegimeGeralWithObservability", () => {
  it("posts the operation to the observability endpoint", async () => {
    const fetch = mockFetch(jsonResponse(recorded))
    await client(fetch).calculateRegimeGeralWithObservability(request)

    const sent = sentRequest(fetch)
    expect(sent.method).toBe("POST")
    expect(sent.url).toBe("http://regime-regular:8080/api/calculadora/observabilidade/regime-geral")
    expect(sent.headers.get("Content-Type")).toBe("application/json")
    expect(await sent.json()).toEqual(request)
  })

  it("sends decimals as plain text", async () => {
    const fetch = mockFetch(jsonResponse(recorded))
    const first = request.itens?.[0]
    if (!first) throw new Error("the example has no items")
    const input: RegimeGeralInput = {
      ...request,
      itens: [{ ...first, baseCalculo: dec("100.50") }],
    }
    await client(fetch).calculateRegimeGeralWithObservability(input)

    const body = (await sentRequest(fetch).json()) as { itens: { baseCalculo: unknown }[] }
    expect(body.itens[0]?.baseCalculo).toBe("100.5")
  })

  it("maps the official example: amounts and rates as decimals", async () => {
    const result = await client(
      mockFetch(jsonResponse(recorded)),
    ).calculateRegimeGeralWithObservability(request)
    if (!result.ok) throw new Error(result.error.kind)

    const item3 = calculated(result.value.items[2])
    expect(item3.estadoItem).toBe("CALCULO_SIMULADO")
    const group = item3.tribCalc?.IBSCBS?.gIBSCBS
    expect(group?.vBC?.toFixed(2)).toBe("1200.00")
    expect(group?.gCBS?.vCBS?.toFixed(2)).toBe("42.24")
    expect(group?.gCBS?.gRed?.pAliqEfet?.toFixed(2)).toBe("3.52")
    expect(group?.gIBSUF?.vIBSUF?.toFixed(2)).toBe("0.24")
    expect(group?.gIBSMun?.vIBSMun?.toFixed(2)).toBe("0.24")
    expect(group?.vIBS?.equals("0.48")).toBe(true)
    // Codes stay text.
    expect(item3.tribCalc?.IBSCBS?.CST).toBe("200")

    const totals = result.value.total?.tribCalc
    expect(totals?.ISTot?.vIS?.toFixed(2)).toBe("15.00")
    expect(totals?.IBSCBSTot?.vBCIBSCBS?.toFixed(2)).toBe("1465.00")
    expect(totals?.IBSCBSTot?.gIBS?.vIBS?.toFixed(2)).toBe("0.64")
    expect(totals?.IBSCBSTot?.gCBS?.vCBS?.toFixed(2)).toBe("56.76")
    // Decimal arithmetic, not floating point: 0.24 + 0.24 = 0.48.
    expect(
      group?.gIBSUF?.vIBSUF?.plus(group.gIBSMun?.vIBSMun ?? "0").equals(group.vIBS ?? "0"),
    ).toBe(true)
  })

  it("returns the REG-011 item error as a typed result, not an exception", async () => {
    const result = await client(
      mockFetch(jsonResponse(recorded)),
    ).calculateRegimeGeralWithObservability(request)
    if (!result.ok) throw new Error(result.error.kind)

    const item4 = result.value.items[3]
    expect(item4).toMatchObject({
      status: "not-calculated",
      nObj: 4,
      estadoItem: "INCONSISTENCIA_ENTRADA",
    })
    if (item4?.status !== "not-calculated") throw new Error("expected a rejected item")
    expect(item4.errors).toEqual([
      {
        code: "REG-011",
        title: "NCM não vinculada",
        pointer: "#/itens/3/ncm",
        detail:
          "NCM de código 02013000 não vinculada à Classificação Tributária de código 200035 (CBS e IBS)",
        type: "http://localhost/api/calculadora/observabilidade/erros?codigo=REG-011",
      },
    ])
    expect(result.value.items.map((item) => item.status)).toEqual([
      "calculated",
      "calculated",
      "calculated",
      "not-calculated",
    ])
  })

  it("maps an HTTP 422 problem with errors (ObservabilidadeExceptionHandler)", async () => {
    const problem = {
      type: "about:blank",
      title: "Erros no processamento do cálculo",
      status: 422,
      detail: "O cálculo contém 1 erro(s).",
      instance: "/api/calculadora/observabilidade/regime-geral",
      timestamp: "2027-03-10T13:00:00Z",
      errors: [
        {
          type: "http://localhost/api/calculadora/observabilidade/erros?codigo=REG-011",
          title: "NCM não vinculada",
          code: "REG-011",
          pointer: "#/itens/0/ncm",
          detail: "NCM não vinculada",
        },
      ],
    }
    const fetch = mockFetch(jsonResponse(problem, 422, "application/problem+json"))
    const result = await client(fetch).calculateRegimeGeralWithObservability(request)

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "problem",
        status: 422,
        code: "REG-011",
        title: "Erros no processamento do cálculo",
        detail: "O cálculo contém 1 erro(s).",
        type: "about:blank",
        errors: [expect.objectContaining({ code: "REG-011", pointer: "#/itens/0/ncm" })],
      },
    })
  })

  it("maps an HTTP 400 problem without errors (invalid fields)", async () => {
    const problem = {
      title: "Campos inválidos.",
      status: 400,
      detail: "Um ou mais campos são inválidos",
    }
    const result = await client(
      mockFetch(jsonResponse(problem, 400, "application/problem+json")),
    ).calculateRegimeGeral(request)

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "problem",
        status: 400,
        title: "Campos inválidos.",
        detail: problem.detail,
        errors: [],
      },
    })
  })

  it("maps an HTTP 5xx without a problem body and does not retry a POST", async () => {
    const fetch = mockFetch(new Response("Bad Gateway", { status: 502 }), jsonResponse(recorded))
    const result = await client(fetch, 3).calculateRegimeGeralWithObservability(request)

    expect(result).toEqual({ ok: false, error: { kind: "http", status: 502 } })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("maps a timeout to its own error", async () => {
    const result = await client(hangingFetch()).calculateRegimeGeralWithObservability(request)
    expect(result).toEqual({ ok: false, error: { kind: "timeout", timeoutMs: 50 } })
  })

  it("maps a connection failure to a network error", async () => {
    const fetch = mockFetch(new TypeError("fetch failed"))
    const result = await client(fetch).calculateRegimeGeralWithObservability(request)
    expect(result).toEqual({ ok: false, error: { kind: "network", message: "fetch failed" } })
  })

  it("rejects a 2xx body whose decimal field is not a decimal", async () => {
    const broken = { total: { tribCalc: { ISTot: { vIS: "15,00" } } } }
    const result = await client(
      mockFetch(jsonResponse(broken)),
    ).calculateRegimeGeralWithObservability(request)
    expect(result).toMatchObject({ ok: false, error: { kind: "invalid-response", status: 200 } })
  })

  it("rejects a 2xx body that is not JSON without quoting it", async () => {
    const result = await client(
      mockFetch(new Response("<html>vBC 1200</html>", { status: 200 })),
    ).calculateRegimeGeralWithObservability(request)
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "invalid-response",
        status: 0,
        message: "the response body does not match the contract",
      },
    })
  })
})

describe("reference data", () => {
  it("reads the version and retries a GET when asked to", async () => {
    const version = { versaoApp: "1.7.2", versaoDb: "V0073" }
    const fetch = mockFetch(new TypeError("fetch failed"), jsonResponse(version))
    const result = await client(fetch, 1).getVersion()

    expect(result).toEqual({ ok: true, value: version })
    expect(sentRequest(fetch, 1).url).toBe(
      "http://regime-regular:8080/api/calculadora/dados-abertos/versao",
    )
  })

  it("parses rates sent as JSON numbers exactly", async () => {
    const fetch = mockFetch(jsonResponse({ aliquotaReferencia: 0.9, aliquotaPropria: 0.9 }))
    const result = await client(fetch).getAliquotaUniao("2027-01-01")

    if (!result.ok) throw new Error(result.error.kind)
    expect(result.value.aliquotaReferencia?.toFixed(4)).toBe("0.9000")
    expect(new URL(sentRequest(fetch).url).searchParams.get("data")).toBe("2027-01-01")
  })
})

describe("XML", () => {
  it("generates the XML group as text", async () => {
    const xml = "<IBSCBS><CST>000</CST></IBSCBS>"
    const fetch = mockFetch(new Response(xml, { headers: { "Content-Type": "application/xml" } }))
    const result = await client(fetch).generateXml({ objetos: [] }, "nfe")

    expect(result).toEqual({ ok: true, value: xml })
    expect(new URL(sentRequest(fetch).url).searchParams.get("tipo")).toBe("nfe")
  })

  it("sends the XML as application/xml to validate it", async () => {
    const fetch = mockFetch(jsonResponse(true))
    const result = await client(fetch).validateXml("<IBSCBS/>", "nfe", "grupo")

    expect(result).toEqual({ ok: true, value: true })
    const sent = sentRequest(fetch)
    expect(sent.headers.get("Content-Type")).toBe("application/xml")
    expect(await sent.text()).toBe("<IBSCBS/>")
  })
})

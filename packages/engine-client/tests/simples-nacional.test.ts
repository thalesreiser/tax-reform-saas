import { describe, expect, it } from "vitest"
import { createSimplesNacionalClient, type SimplesNacionalInput } from "../src/index.js"
import { jsonResponse, mockFetch, readJson, sentRequest } from "./helpers.js"

// Example from the upstream OpenAPI contract (EXEMPLO_NFE, 1.0.2) and the engine's recorded answer.
const request = (await readJson(
  "../../../engines/fixtures/simples-nacional/request.json",
)) as SimplesNacionalInput
const recorded = await readJson("./fixtures/simples-nacional-nao-assistido.json")

function client(fetch: (request: Request) => Promise<Response>) {
  return createSimplesNacionalClient({ baseUrl: "http://simples-nacional:8082", fetch })
}

describe("calculateSimplesNacional", () => {
  it("posts to the unassisted endpoint and maps the values as decimals", async () => {
    const fetch = mockFetch(jsonResponse(recorded))
    const result = await client(fetch).calculateSimplesNacional(request)

    expect(sentRequest(fetch).url).toBe(
      "http://simples-nacional:8082/api/calculadora/observabilidade/simples-nacional/nao-assistido",
    )
    if (!result.ok) throw new Error(result.error.kind)
    const item = result.value.items[0]
    if (item?.status !== "calculated") throw new Error("expected a calculated item")
    expect(item.tribCalc?.vCBSSN?.toFixed(2)).toBe("11.61")
    expect(item.tribCalc?.vIBSSN?.toFixed(2)).toBe("0.13")
    expect(item.tribCalc?.pCBSSN?.toFixed(4)).toBe("1.1612")
    expect(result.value.total?.totalTributos?.toFixed(2)).toBe("11.74")
    expect(result.value.resolucaoAliquotas?.itens?.[0]?.anexoAplicado).toBe("I")
  })

  it("maps a global VSN error (HTTP 422) with its code and pointer", async () => {
    const problem = {
      type: "about:blank",
      title: "Erros no processamento do cálculo",
      status: 422,
      detail: "O cálculo contém 1 erro(s).",
      errors: [
        {
          type: "http://localhost/api/calculadora/observabilidade/simples-nacional/erros?codigo=VSN-001",
          title: "Base de cálculo ausente",
          code: "VSN-001",
          pointer: "#/itens/0/baseCalculo",
          detail: "Informe a base de cálculo do item",
        },
      ],
    }
    const result = await client(
      mockFetch(jsonResponse(problem, 422, "application/problem+json")),
    ).calculateSimplesNacional(request)

    if (result.ok || result.error.kind !== "problem") throw new Error("expected a problem")
    expect(result.error.code).toBe("VSN-001")
    expect(result.error.errors[0]).toMatchObject({ pointer: "#/itens/0/baseCalculo" })
  })
})

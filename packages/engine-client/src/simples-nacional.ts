import createClient from "openapi-fetch"
import { decimalize, toWire, type DecimalInput, type Decimalized } from "./decimals.js"
import type { EngineResult } from "./errors.js"
import type { components, operations, paths } from "./generated/simples-nacional.js"
import { decimalShapes } from "./generated/simples-nacional-decimals.js"
import {
  apiBaseUrl,
  call,
  transportFetch,
  type CallOptions,
  type EngineClientOptions,
} from "./http.js"
import { asObject, withItems, type ItemResult } from "./items.js"

type Schemas = components["schemas"]
type Decimals<N extends keyof Schemas> = Decimalized<Schemas[N]>

export type SimplesNacionalInput = DecimalInput<Schemas["OperacaoSimplesNaoAssistidaInput"]>
export type SimplesNacionalItem = ItemResult<Decimals<"ObjetoSimplesDomain">>
export type SimplesNacionalResult = Omit<Decimals<"ObservabilidadeSimplesDomain">, "objetos"> & {
  items: SimplesNacionalItem[]
}
export type SimplesNacionalVersion = Schemas["VersaoDomain"]
export type SimplesErrorDescription = Schemas["ErroDescricaoSimples"]
export type AtividadeSimples = Schemas["AtividadeSimplesDomain"]
export type AtividadesQuery = operations["listarAtividades"]["parameters"]["query"]

/** Client of `calculadora-rtc-simples-nacional` (CBS and IBS of Simples Nacional taxpayers). */
export function createSimplesNacionalClient(options: EngineClientOptions) {
  const client = createClient<paths>({
    baseUrl: apiBaseUrl(options.baseUrl),
    fetch: transportFetch(options.fetch),
  })

  return {
    /**
     * `POST /calculadora/observabilidade/simples-nacional/nao-assistido`: the endpoint upstream
     * recommends for every document type (the per-item-rate endpoint is obsolete).
     */
    calculateSimplesNacional(
      input: SimplesNacionalInput,
      opts?: CallOptions,
    ): Promise<EngineResult<SimplesNacionalResult>> {
      const body = toWire(input) as Schemas["OperacaoSimplesNaoAssistidaInput"]
      return call(
        options,
        "POST",
        (signal) =>
          client.POST("/calculadora/observabilidade/simples-nacional/nao-assistido", {
            body,
            signal,
          }),
        (data) => {
          const shape = { ref: "ObservabilidadeSimplesDomain" } as const
          const parsed = decimalize(asObject(data), shape, decimalShapes)
          return withItems(parsed as Decimals<"ObservabilidadeSimplesDomain">)
        },
        opts,
      )
    },

    /** `GET /versao`: `versaoApp` is the release tag, `versaoDb` the database version. */
    getVersion(opts?: CallOptions): Promise<EngineResult<SimplesNacionalVersion>> {
      return call(
        options,
        "GET",
        (signal) => client.GET("/versao", { signal }),
        (data) => asObject(data) as SimplesNacionalVersion,
        opts,
      )
    },

    /** `GET /calculadora/observabilidade/simples-nacional/erros`: a VSN code's description. */
    getErrorDescription(
      codigo: string,
      opts?: CallOptions,
    ): Promise<EngineResult<SimplesErrorDescription>> {
      return call(
        options,
        "GET",
        (signal) =>
          client.GET("/calculadora/observabilidade/simples-nacional/erros", {
            params: { query: { codigo } },
            signal,
          }),
        (data) => asObject(data) as SimplesErrorDescription,
        opts,
      )
    },

    /** `GET /calculadora/simples-nacional/atividades`: activities (cAtivSN) valid on a date. */
    listAtividades(
      query: AtividadesQuery,
      opts?: CallOptions,
    ): Promise<EngineResult<AtividadeSimples[]>> {
      return call(
        options,
        "GET",
        (signal) =>
          client.GET("/calculadora/simples-nacional/atividades", { params: { query }, signal }),
        (data) => {
          if (!Array.isArray(data)) throw new TypeError("the activities are not a list")
          return data as AtividadeSimples[]
        },
        opts,
      )
    },
  }
}

export type SimplesNacionalClient = ReturnType<typeof createSimplesNacionalClient>

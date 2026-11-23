import createClient from "openapi-fetch"
import { decimalize, toWire, type DecimalInput, type Decimalized } from "./decimals.js"
import type { EngineResult } from "./errors.js"
import type { components, operations, paths } from "./generated/regime-regular.js"
import { decimalShapes } from "./generated/regime-regular-decimals.js"
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

export type RegimeGeralInput = DecimalInput<Schemas["OperacaoInput"]>
export type RegimeGeralResult = Decimals<"ROCDomain">
export type RegimeGeralItem = ItemResult<Decimals<"ObservabilidadeItemDomain">>
export type RegimeGeralObservability = Omit<Decimals<"ObservabilidadeROCDomain">, "objetos"> & {
  items: RegimeGeralItem[]
}
export type XmlDocumentType = operations["generate"]["parameters"]["query"]["tipo"]
export type XmlSubtype = operations["validate"]["parameters"]["query"]["subtipo"]
export type RegimeRegularVersion = Schemas["VersaoOutput"]
export type ErrorDescription = Schemas["ErroDescricao"]
export type Aliquota = Decimals<"AliquotaDadosAbertosOutput">
export type ClassificacaoTributaria = Decimals<"ClassificacaoTributariaDadosAbertosOutput">

const decimals =
  <N extends keyof Schemas & keyof typeof decimalShapes>(name: N) =>
  (data: unknown): Decimals<N> =>
    decimalize(asObject(data), { ref: name }, decimalShapes) as Decimals<N>

const plain =
  <N extends keyof Schemas>() =>
  (data: unknown): Schemas[N] =>
    asObject(data) as Schemas[N]

/** Client of `calculadora-rtc-regime-regular` (CBS, IBS and IS in the regular regime). */
export function createRegimeRegularClient(options: EngineClientOptions) {
  const client = createClient<paths>({
    baseUrl: apiBaseUrl(options.baseUrl),
    fetch: transportFetch(options.fetch),
  })

  return {
    /** `POST /calculadora/regime-geral`: the whole document fails on the first error. */
    calculateRegimeGeral(
      input: RegimeGeralInput,
      opts?: CallOptions,
    ): Promise<EngineResult<RegimeGeralResult>> {
      const body = toWire(input) as Schemas["OperacaoInput"]
      return call(
        options,
        "POST",
        (signal) => client.POST("/calculadora/regime-geral", { body, signal }),
        decimals("ROCDomain"),
        opts,
      )
    },

    /** `POST /calculadora/observabilidade/regime-geral`: per-item results with error codes. */
    calculateRegimeGeralWithObservability(
      input: RegimeGeralInput,
      opts?: CallOptions,
    ): Promise<EngineResult<RegimeGeralObservability>> {
      const body = toWire(input) as Schemas["OperacaoInput"]
      return call(
        options,
        "POST",
        (signal) => client.POST("/calculadora/observabilidade/regime-geral", { body, signal }),
        (data) => withItems(decimals("ObservabilidadeROCDomain")(data)),
        opts,
      )
    },

    /** `POST /calculadora/xml/generate`: the CBS/IBS/IS XML group of a calculation result. */
    generateXml(
      result: DecimalInput<Schemas["ROCDomain"]>,
      tipo: XmlDocumentType,
      opts?: CallOptions,
    ): Promise<EngineResult<string>> {
      const body = toWire(result) as Schemas["ROCDomain"]
      return call(
        options,
        "POST",
        (signal) =>
          client.POST("/calculadora/xml/generate", {
            params: { query: { tipo } },
            body,
            parseAs: "text",
            signal,
          }),
        (data) => {
          if (typeof data !== "string") throw new TypeError("the XML is not text")
          return data
        },
        opts,
      )
    },

    /** `POST /calculadora/xml/validate`: `true` when the XML is valid for the document type. */
    validateXml(
      xml: string,
      tipo: XmlDocumentType,
      subtipo: XmlSubtype,
      opts?: CallOptions,
    ): Promise<EngineResult<boolean>> {
      return call(
        options,
        "POST",
        (signal) =>
          client.POST("/calculadora/xml/validate", {
            params: { query: { tipo, subtipo } },
            body: xml,
            bodySerializer: (text: string) => text,
            headers: { "Content-Type": "application/xml" },
            signal,
          }),
        (data) => {
          if (typeof data !== "boolean") throw new TypeError("the result is not a boolean")
          return data
        },
        opts,
      )
    },

    /** `GET /calculadora/dados-abertos/versao`: `versaoApp` is the release tag. */
    getVersion(opts?: CallOptions): Promise<EngineResult<RegimeRegularVersion>> {
      return call(
        options,
        "GET",
        (signal) => client.GET("/calculadora/dados-abertos/versao", { signal }),
        plain<"VersaoOutput">(),
        opts,
      )
    },

    /** `GET /calculadora/observabilidade/erros`: title and description of a REG, CAL or VAL code. */
    getErrorDescription(
      codigo: string,
      opts?: CallOptions,
    ): Promise<EngineResult<ErrorDescription>> {
      return call(
        options,
        "GET",
        (signal) =>
          client.GET("/calculadora/observabilidade/erros", {
            params: { query: { codigo } },
            signal,
          }),
        plain<"ErroDescricao">(),
        opts,
      )
    },

    /** `GET /calculadora/dados-abertos/aliquota-uniao`: CBS rates on a date (YYYY-MM-DD). */
    getAliquotaUniao(data: string, opts?: CallOptions): Promise<EngineResult<Aliquota>> {
      return call(
        options,
        "GET",
        (signal) =>
          client.GET("/calculadora/dados-abertos/aliquota-uniao", {
            params: { query: { data } },
            signal,
          }),
        decimals("AliquotaDadosAbertosOutput"),
        opts,
      )
    },

    /** `GET .../cbs-ibs/class-trib/{cClassTrib}`: one tax classification on a date (YYYY-MM-DD). */
    getClassificacaoTributaria(
      cClassTrib: string,
      data: string,
      opts?: CallOptions,
    ): Promise<EngineResult<ClassificacaoTributaria>> {
      return call(
        options,
        "GET",
        (signal) =>
          client.GET(
            "/calculadora/dados-abertos/classificacoes-tributarias/cbs-ibs/class-trib/{cClassTrib}",
            { params: { path: { cClassTrib }, query: { data } }, signal },
          ),
        decimals("ClassificacaoTributariaDadosAbertosOutput"),
        opts,
      )
    },
  }
}

export type RegimeRegularClient = ReturnType<typeof createRegimeRegularClient>

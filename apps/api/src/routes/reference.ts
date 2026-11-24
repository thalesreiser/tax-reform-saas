import { createHash } from "node:crypto"
import {
  createRegimeRegularClient,
  type EngineResult,
  type RegimeRegularClient,
} from "@trs/engine-client"
import { Fiscal } from "@trs/tax-legacy"
import type { FastifyReply, FastifyRequest } from "fastify"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod"
import { problem, problemSchema, sendProblem } from "../problem.js"
import { EngineFailure, ReferenceCache, cacheKey } from "../reference/cache.js"

export const ENGINE_NAME = "calculadora-rtc-regime-regular"
const VERSION_TTL_MS = 5 * 60 * 1000

/** What the routes call on the regime-regular engine (a mock in unit tests). */
export type ReferenceEngine = Pick<
  RegimeRegularClient,
  | "getVersion"
  | "listSituacoesTributarias"
  | "getClassificacaoTributaria"
  | "listFundamentacoesLegais"
  | "listNcm"
  | "getNcm"
  | "listNbs"
  | "getNbs"
  | "getAliquotaUniao"
  | "getAliquotaUf"
  | "getAliquotaMunicipio"
>

export type Authenticate = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>

export interface ReferenceOptions {
  /**
   * Auth strategies, tried by Fastify in order as preHandlers: today the office session
   * (`app.requireOffice`); API keys (BE-03.1) are added here as another strategy.
   */
  authenticate: Authenticate[]
  engineUrl?: string | undefined
  /** Covers an engine cold start on Flycast (about 25 s). */
  timeoutMs: number
  ttlSeconds: number
  /** Replaces the HTTP client (tests). */
  engine?: ReferenceEngine
}

const dateSchema = z.iso.date().optional().describe("Validity date (YYYY-MM-DD); default today")
const decimal = z.string().describe("Decimal as text")
const text = z.string().optional()
const flag = z.boolean().optional()

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({
    engine: z.object({ name: z.string(), version: z.string() }),
    dataVersion: z.object({ version: z.string(), date: z.string() }),
    validOn: z.string(),
    data,
  })
const page = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  })

const cstSchema = z.object({
  id: z.number().int().optional(),
  codigo: text,
  descricao: text,
  classificacoesTributarias: z.array(z.object({ codigo: text, descricao: text })).optional(),
})
const classTribSchema = z.object({
  codigo: text,
  descricao: text,
  descricaoTratamentoTributario: text,
  nomenclatura: text,
  tipoAliquota: text,
  dataAtualizacao: text,
  possuiPercentualReducao: flag,
  percentualReducaoCbs: decimal.optional(),
  percentualReducaoIbsUf: decimal.optional(),
  percentualReducaoIbsMun: decimal.optional(),
  indicaCreditoPresumidoFornecedor: flag,
  indicaCreditoPresumidoAdquirente: flag,
  tipoReceitaBrutaSimplesNacional: z.number().int().optional(),
})
const legalBasisSchema = z.object({
  codigoSituacaoTributaria: text,
  codigoClassificacaoTributaria: text,
  conjuntoTributo: text,
  referenciaNormativa: text,
  texto: text,
  textoCurto: text,
})
const codeItem = z.object({ codigo: z.string(), descricao: text })
const ncmSchema = z.object({
  capitulo: text,
  posicao: text,
  subposicao: text,
  item: text,
  subitem: text,
  unidade: text,
  tributadoPeloImpostoSeletivo: flag,
  aliquotaAdValorem: decimal.optional(),
  aliquotaAdRem: decimal.optional(),
})
const nbsSchema = z.object({
  capitulo: text,
  posicao: text,
  subposicao1: text,
  subposicao2: text,
  item: text,
  tributadoPeloImpostoSeletivo: flag,
  aliquotaAdValorem: decimal.optional(),
})
const rateSchema = z.object({
  aliquotaReferencia: decimal.optional(),
  aliquotaPropria: decimal.optional(),
  formaAplicacao: text,
})

const errors = { 400: problemSchema, 401: problemSchema, 403: problemSchema, 404: problemSchema }
const engineErrors = { 502: problemSchema, 503: problemSchema, 504: problemSchema }

/** Decimals become their plain text (RNF: amounts and rates as decimal strings). */
function plain(value: unknown): unknown {
  if (Fiscal.isDecimal(value)) return value.toFixed()
  if (Array.isArray(value)) return value.map(plain)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]))
  }
  return value
}

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
}

/** Accent- and case-insensitive text for the NCM/NBS search. */
function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
}

/**
 * Reference data of the official regime-regular engine (RF-13): CST and cClassTrib, legal bases,
 * NCM and NBS, reference rates. Answers come from an in-process cache keyed by the engine version.
 */
export const referenceRoutes: FastifyPluginAsyncZod<ReferenceOptions> = (app, options) => {
  const engine =
    options.engine ??
    (options.engineUrl === undefined
      ? undefined
      : createRegimeRegularClient({ baseUrl: options.engineUrl, timeoutMs: options.timeoutMs }))
  const cache = new ReferenceCache({ ttlMs: options.ttlSeconds * 1000 })
  const maxAge = `private, max-age=${options.ttlSeconds}`

  // Codes and search text may be fiscal data: the request log shows the route pattern only.
  app.addHook("onRoute", (route) => {
    route.logSerializers = {
      ...route.logSerializers,
      req: (req: FastifyRequest) => `${req.method} ${route.url}`,
    }
  })

  async function load<T>(
    request: FastifyRequest,
    reply: FastifyReply,
    endpoint: string,
    params: Record<string, string | number>,
    call: (engine: ReferenceEngine) => Promise<EngineResult<T>>,
    shape: (value: T) => unknown = (value) => value,
  ) {
    if (engine === undefined) {
      return sendProblem(
        reply,
        problem(request, 503, { detail: "Reference data is not available right now." }),
      )
    }
    try {
      const version = await cache.get("version", () => engine.getVersion(), VERSION_TTL_MS)
      const engineVersion = version.versaoApp ?? "unknown"
      const value = await cache.get(`${engineVersion}:${endpoint}:${cacheKey(params)}`, () =>
        call(engine),
      )
      const body = {
        engine: { name: ENGINE_NAME, version: engineVersion },
        dataVersion: { version: version.versaoDb ?? "unknown", date: version.dataVersaoDb ?? "" },
        validOn: String(params.date),
        data: plain(shape(value)),
      }
      const etag = `"${createHash("sha256").update(JSON.stringify(body)).digest("base64url")}"`
      reply.header("cache-control", maxAge).header("etag", etag)
      if (request.headers["if-none-match"] === etag) return reply.code(304).send()
      return reply.code(200).send(body as never)
    } catch (error) {
      if (!(error instanceof EngineFailure)) throw error
      const failure = error.error
      // Only the kind and status reach the log; the engine body is never echoed or logged.
      request.log.warn(
        { engineError: failure.kind, status: "status" in failure ? failure.status : undefined },
        "reference engine call failed",
      )
      if ((failure.kind === "problem" || failure.kind === "http") && failure.status === 404) {
        return sendProblem(reply, problem(request, 404, { detail: "Reference not found." }))
      }
      const status = failure.kind === "timeout" ? 504 : 502
      return sendProblem(
        reply,
        problem(request, status, { detail: "The calculation engine did not answer. Try again." }),
      )
    }
  }

  const route = { preHandler: options.authenticate }
  const tags = ["reference"]
  const dated = z.object({ date: dateSchema })
  const searchQuery = z.object({
    date: dateSchema,
    q: z.string().trim().max(100).optional().describe("Code prefix or words of the description"),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
  })

  type CodeItem = { codigo: string; descricao?: string | undefined }
  function paginate(items: CodeItem[], q: string | undefined, n: number, size: number) {
    const needle = q === undefined || q === "" ? undefined : fold(q)
    const found =
      needle === undefined
        ? items
        : items.filter(
            (item) => item.codigo.startsWith(needle) || fold(item.descricao ?? "").includes(needle),
          )
    return {
      items: found.slice((n - 1) * size, n * size),
      page: n,
      pageSize: size,
      total: found.length,
    }
  }

  app.get(
    "/cst",
    {
      ...route,
      schema: {
        tags,
        summary: "CBS/IBS tax situations (CST) with their classifications (cClassTrib)",
        querystring: dated,
        response: { 200: envelope(z.array(cstSchema)), ...errors, ...engineErrors },
      },
    },
    (request, reply) => {
      const date = request.query.date ?? today()
      return load(request, reply, "cst", { date }, (e) => e.listSituacoesTributarias(date))
    },
  )

  app.get(
    "/class-trib/:code",
    {
      ...route,
      schema: {
        tags,
        summary: "One CBS/IBS tax classification (cClassTrib)",
        params: z.object({ code: z.string().regex(/^\d{6}$/) }),
        querystring: dated,
        response: { 200: envelope(classTribSchema), ...errors, ...engineErrors },
      },
    },
    (request, reply) => {
      const date = request.query.date ?? today()
      const { code } = request.params
      return load(request, reply, "class-trib", { code, date }, (e) =>
        e.getClassificacaoTributaria(code, date),
      )
    },
  )

  app.get(
    "/legal-bases",
    {
      ...route,
      schema: {
        tags,
        summary: "Legal basis of each CST and cClassTrib",
        querystring: dated,
        response: { 200: envelope(z.array(legalBasisSchema)), ...errors, ...engineErrors },
      },
    },
    (request, reply) => {
      const date = request.query.date ?? today()
      return load(request, reply, "legal-bases", { date }, (e) => e.listFundamentacoesLegais(date))
    },
  )

  for (const kind of ["ncm", "nbs"] as const) {
    const label = kind.toUpperCase()
    app.get(
      `/${kind}`,
      {
        ...route,
        schema: {
          tags,
          summary: `Search ${label} codes valid on a date`,
          querystring: searchQuery,
          response: { 200: envelope(page(codeItem)), ...errors, ...engineErrors },
        },
      },
      (request, reply) => {
        const { q, page: n, pageSize } = request.query
        const date = request.query.date ?? today()
        // The whole table is cached once per date; search and pages are computed from it.
        return kind === "ncm"
          ? load(
              request,
              reply,
              "ncm-list",
              { date },
              (e) => e.listNcm(date),
              (list) =>
                paginate(
                  list.map((i) => ({ codigo: i.ncm ?? "", descricao: i.descricao })),
                  q,
                  n,
                  pageSize,
                ),
            )
          : load(
              request,
              reply,
              "nbs-list",
              { date },
              (e) => e.listNbs(date),
              (list) =>
                paginate(
                  list.map((i) => ({ codigo: i.codigo ?? "", descricao: i.descricao })),
                  q,
                  n,
                  pageSize,
                ),
            )
      },
    )
  }

  app.get(
    "/ncm/:code",
    {
      ...route,
      schema: {
        tags,
        summary: "One NCM (8 digits) and its Selective Tax data",
        params: z.object({ code: z.string().regex(/^\d{8}$/) }),
        querystring: dated,
        response: { 200: envelope(ncmSchema), ...errors, ...engineErrors },
      },
    },
    (request, reply) => {
      const date = request.query.date ?? today()
      const { code } = request.params
      return load(request, reply, "ncm", { code, date }, (e) => e.getNcm(code, date))
    },
  )

  app.get(
    "/nbs/:code",
    {
      ...route,
      schema: {
        tags,
        summary: "One NBS and its Selective Tax data",
        params: z.object({ code: z.string().regex(/^\d{3,9}$/) }),
        querystring: dated,
        response: { 200: envelope(nbsSchema), ...errors, ...engineErrors },
      },
    },
    (request, reply) => {
      const date = request.query.date ?? today()
      const { code } = request.params
      return load(request, reply, "nbs", { code, date }, (e) => e.getNbs(code, date))
    },
  )

  app.get(
    "/rates/union",
    {
      ...route,
      schema: {
        tags,
        summary: "CBS reference rate (União) on a date",
        querystring: dated,
        response: { 200: envelope(rateSchema), ...errors, ...engineErrors },
      },
    },
    (request, reply) => {
      const date = request.query.date ?? today()
      return load(request, reply, "rate-union", { date }, (e) => e.getAliquotaUniao(date))
    },
  )

  app.get(
    "/rates/states/:code",
    {
      ...route,
      schema: {
        tags,
        summary: "IBS state reference rate (UF, IBGE code) on a date",
        params: z.object({ code: z.coerce.number().int().min(11).max(53) }),
        querystring: dated,
        response: { 200: envelope(rateSchema), ...errors, ...engineErrors },
      },
    },
    (request, reply) => {
      const date = request.query.date ?? today()
      const { code } = request.params
      return load(request, reply, "rate-uf", { code, date }, (e) => e.getAliquotaUf(code, date))
    },
  )

  app.get(
    "/rates/municipalities/:code",
    {
      ...route,
      schema: {
        tags,
        summary: "IBS municipal reference rate (IBGE code) on a date",
        params: z.object({ code: z.coerce.number().int().min(1000000).max(9999999) }),
        querystring: dated,
        response: { 200: envelope(rateSchema), ...errors, ...engineErrors },
      },
    },
    (request, reply) => {
      const date = request.query.date ?? today()
      const { code } = request.params
      return load(request, reply, "rate-municipality", { code, date }, (e) =>
        e.getAliquotaMunicipio(code, date),
      )
    },
  )

  return Promise.resolve()
}

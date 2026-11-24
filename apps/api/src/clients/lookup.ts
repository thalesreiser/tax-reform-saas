import { LRUCache } from "lru-cache"
import { z } from "zod"

/** Registry data of a CNPJ, in our shape (RF-02). Text the source leaves empty is null. */
export const cnpjRecordSchema = z.object({
  cnpj: z.string(),
  legalName: z.string(),
  tradeName: z.string().nullable(),
  address: z.object({
    street: z.string().nullable(),
    number: z.string().nullable(),
    complement: z.string().nullable(),
    district: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    postalCode: z.string().nullable(),
    ibgeCode: z.string().nullable(),
  }),
  mainCnae: z.object({ code: z.string(), description: z.string().nullable() }).nullable(),
  secondaryCnaes: z.array(z.object({ code: z.string(), description: z.string().nullable() })),
  registrationStatus: z.string().nullable(),
  simplesOption: z.boolean().nullable(),
  meiOption: z.boolean().nullable(),
  /**
   * Only what the source states: `mei` or `simples_nacional` from the current options; `unknown`
   * otherwise (Lucro Real / Presumido is never inferred from "not Simples").
   */
  taxRegime: z.enum(["mei", "simples_nacional", "unknown"]),
  /** Latest yearly taxation form the source reports (e.g. "LUCRO PRESUMIDO"), as given. */
  latestDeclaredTaxation: z.object({ year: z.number().int(), form: z.string() }).nullable(),
  source: z.string(),
  fetchedAt: z.iso.datetime(),
})
export type CnpjRecord = z.output<typeof cnpjRecordSchema>

export type LookupFailure = "not_found" | "timeout" | "upstream"

export class CnpjLookupError extends Error {
  override name = "CnpjLookupError"
  constructor(
    readonly kind: LookupFailure,
    readonly status?: number,
  ) {
    super(`CNPJ lookup failed: ${kind}`)
  }
}

/** A CNPJ data provider. BrasilAPI today; swappable (README "Clients"). */
export interface CnpjProvider {
  readonly name: string
  /** Throws CnpjLookupError. `cnpj` is already normalised and valid. */
  fetch(cnpj: string): Promise<CnpjRecord>
}

const text = z
  .string()
  .nullish()
  .transform((v) => (v === undefined || v === null || v.trim() === "" ? null : v.trim()))
const code = z.union([z.number(), z.string()]).nullish()

/** The BrasilAPI fields we read (https://brasilapi.com.br/docs#tag/CNPJ); the rest is ignored. */
export const brasilApiSchema = z.object({
  cnpj: z.string(),
  razao_social: z.string().min(1),
  nome_fantasia: text,
  logradouro: text,
  numero: text,
  complemento: text,
  bairro: text,
  municipio: text,
  uf: text,
  cep: text,
  codigo_municipio_ibge: code,
  cnae_fiscal: code,
  cnae_fiscal_descricao: text,
  cnaes_secundarios: z
    .array(z.object({ codigo: code, descricao: text }))
    .nullish()
    .transform((v) => v ?? []),
  descricao_situacao_cadastral: text,
  opcao_pelo_simples: z.boolean().nullish(),
  opcao_pelo_mei: z.boolean().nullish(),
  regime_tributario: z
    .array(z.object({ ano: z.number().int(), forma_de_tributacao: text }))
    .nullish()
    .transform((v) => v ?? []),
})

const cnae = (value: number | string | null | undefined): string | null => {
  if (value === null || value === undefined) return null
  const digits = String(value).replace(/\D/g, "")
  return digits === "" || /^0+$/.test(digits) ? null : digits.padStart(7, "0")
}

/** Maps a BrasilAPI answer to our shape. */
export function fromBrasilApi(body: unknown, fetchedAt: Date): CnpjRecord {
  const b = brasilApiSchema.parse(body)
  const main = cnae(b.cnae_fiscal)
  const latest = b.regime_tributario
    .filter((r) => r.forma_de_tributacao !== null)
    .sort((x, y) => y.ano - x.ano)[0]
  const ibge = b.codigo_municipio_ibge
  return {
    cnpj: b.cnpj,
    legalName: b.razao_social.trim(),
    tradeName: b.nome_fantasia,
    address: {
      street: b.logradouro,
      number: b.numero,
      complement: b.complemento,
      district: b.bairro,
      city: b.municipio,
      state: b.uf,
      postalCode: b.cep,
      ibgeCode: ibge === null || ibge === undefined ? null : String(ibge),
    },
    mainCnae: main === null ? null : { code: main, description: b.cnae_fiscal_descricao },
    secondaryCnaes: b.cnaes_secundarios.flatMap((c) => {
      const value = cnae(c.codigo)
      return value === null ? [] : [{ code: value, description: c.descricao }]
    }),
    registrationStatus: b.descricao_situacao_cadastral,
    simplesOption: b.opcao_pelo_simples ?? null,
    meiOption: b.opcao_pelo_mei ?? null,
    taxRegime:
      b.opcao_pelo_mei === true
        ? "mei"
        : b.opcao_pelo_simples === true
          ? "simples_nacional"
          : "unknown",
    latestDeclaredTaxation:
      latest === undefined ? null : { year: latest.ano, form: latest.forma_de_tributacao ?? "" },
    source: "brasilapi",
    fetchedAt: fetchedAt.toISOString(),
  }
}

export interface BrasilApiOptions {
  /** Base URL, without the trailing CNPJ (default BrasilAPI's CNPJ v1). */
  baseUrl: string
  timeoutMs: number
  fetch?: typeof fetch
}

/** BrasilAPI: free third-party service, no SLA (decision for staging and beta, README). */
export function brasilApiProvider({
  baseUrl,
  timeoutMs,
  fetch: doFetch = fetch,
}: BrasilApiOptions): CnpjProvider {
  return {
    name: "brasilapi",
    async fetch(cnpj) {
      let response: Response
      try {
        response = await doFetch(`${baseUrl.replace(/\/$/, "")}/${encodeURIComponent(cnpj)}`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (error) {
        const name = error instanceof Error ? error.name : ""
        throw new CnpjLookupError(
          name === "TimeoutError" || name === "AbortError" ? "timeout" : "upstream",
        )
      }
      // The body is never read on failure: it is neither returned nor logged.
      if (response.status === 404) throw new CnpjLookupError("not_found", 404)
      if (!response.ok) throw new CnpjLookupError("upstream", response.status)
      try {
        return fromBrasilApi(await response.json(), new Date())
      } catch {
        throw new CnpjLookupError("upstream", response.status)
      }
    },
  }
}

/**
 * Lookup with a small in-process cache: registry data changes rarely and is the same for every
 * office. Failures are not cached.
 */
export class CnpjLookup {
  private readonly cache: LRUCache<string, CnpjRecord>

  constructor(
    private readonly provider: CnpjProvider,
    { ttlMs = 60 * 60 * 1000, max = 500 }: { ttlMs?: number; max?: number } = {},
  ) {
    this.cache = new LRUCache({ max, ttl: ttlMs })
  }

  async get(cnpj: string): Promise<CnpjRecord> {
    const hit = this.cache.get(cnpj)
    if (hit !== undefined) return hit
    const record = await this.provider.fetch(cnpj)
    this.cache.set(cnpj, record)
    return record
  }
}

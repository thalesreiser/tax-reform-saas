import { z } from "zod"
import { errorStatus, type Translate } from "./auth"
import { isValidCnpj, normalizeCnpj } from "./cnpj"

// Clients (FE-02.2, RF-02): API shapes (apps/api/src/routes/clients.ts), form schema and error
// messages. Plain module, so the unit tests exercise it directly.

export type TaxRegime = "mei" | "simples_nacional" | "unknown"

export interface CnpjRecord {
  cnpj: string
  legalName: string
  tradeName: string | null
  address: { city: string | null; state: string | null } & Record<string, string | null>
  mainCnae: { code: string; description: string | null } | null
  registrationStatus: string | null
  taxRegime: TaxRegime
  source: string
  fetchedAt: string
}

export interface Client {
  id: string
  cnpj: string
  legalName: string
  tradeName: string | null
  registrationStatus: string | null
  taxRegime: string | null
  lookup: { source: string; fetchedAt: string } | null
  notes: string | null
}

export interface ClientPage {
  items: Client[]
  page: number
  pageSize: number
  total: number
}

export const CLIENTS_PAGE_SIZE = 20

/** Message key of the regime the registry reported; informational until the fiscal profile. */
export function regimeKey(regime: string | null): string {
  return regime === "mei" || regime === "simples_nacional"
    ? `clients.regimes.${regime}`
    : "clients.regimes.unknown"
}

export type ClientAction = "lookup" | "create" | "load" | "save" | "delete"

/** Message key for a failed clients or CNPJ call (problem details from the API). */
export function clientErrorKey(error: unknown, action: ClientAction): string {
  const status = errorStatus(error)
  if (status === undefined) return "clients.errors.network"
  if (status === 429) return "clients.errors.rateLimited"
  if (status === 409 && action === "create") return "clients.errors.duplicate"
  if ((status === 404 && action === "lookup") || (status === 422 && action === "create")) {
    return "clients.errors.cnpjNotFound"
  }
  if ((status === 502 || status === 504) && (action === "lookup" || action === "create")) {
    return "clients.errors.lookupUnavailable"
  }
  if (status === 404 || (status === 400 && action === "load")) return "clients.errors.notFound"
  return "clients.errors.generic"
}

/** Lookup failures after which the form switches to manual entry. */
export function lookupFailed(error: unknown): boolean {
  return [404, 422, 502, 504].includes(errorStatus(error) ?? 0)
}

const text = (t: Translate, max: number) =>
  z.string().trim().max(max, t("clients.validation.tooLong", { max }))

export const clientFormSchema = (t: Translate, withCnpj: boolean) =>
  z.object({
    cnpj: withCnpj
      ? z.string().refine((v) => isValidCnpj(normalizeCnpj(v)), t("clients.validation.cnpjInvalid"))
      : z.string(),
    legalName: text(t, 200).min(1, t("clients.validation.legalNameRequired")),
    tradeName: text(t, 200),
    notes: text(t, 2000),
  })

export type ClientFormInput = z.output<ReturnType<typeof clientFormSchema>>

/** "24/11/2026, 14:05" in Brasília time. */
export function formatFetchedAt(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso))
}

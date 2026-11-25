import { dec, sum } from "@trs/tax-legacy"
import { z } from "zod"
import {
  DESTINATIONS,
  FISCAL_REGIMES,
  OPERATION_TYPES,
  PURCHASE_CATEGORIES,
  SIMPLES_ANNEXES,
} from "../db/schema.js"

/*
 * Fiscal profile of a client (RF-03): input validation and completeness only. No tax rule lives
 * here (which annex fits a CNAE, whether factor R applies, which purchase gives credit): those
 * belong to packages/tax-legacy and the simulation (MOT-03.2), validated by the accountant.
 */

/** IBGE code of each UF: the first two digits of its municipalities' 7-digit codes. */
export const UF_IBGE = {
  RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17",
  MA: "21", PI: "22", CE: "23", RN: "24", PB: "25", PE: "26", AL: "27", SE: "28", BA: "29",
  MG: "31", ES: "32", RJ: "33", SP: "35",
  PR: "41", SC: "42", RS: "43",
  MS: "50", MT: "51", GO: "52", DF: "53",
} as const // prettier-ignore
export type Uf = keyof typeof UF_IBGE
export const UFS = Object.keys(UF_IBGE) as [Uf, ...Uf[]]

/** Format checks of the codes the engines take (digits only, no punctuation). */
export const CODE_FORMATS = {
  ncm: /^\d{8}$/,
  /** NBS item as in the NFS-e `cNBS` field: 9 digits (e.g. 1.0101.10.00 -> 101011000). */
  nbs: /^\d{9}$/,
  cnae: /^\d{7}$/,
  municipality: /^\d{7}$/,
  cClassTrib: /^\d{6}$/,
  cst: /^\d{3}$/,
} as const

/** Strips dots, dashes, slashes and spaces, so "6201-5/01" and "1.0101.10.00" are accepted. */
const digits = (format: RegExp, label: string) =>
  z
    .string()
    .transform((v) => v.replace(/[\s./-]/g, ""))
    .pipe(z.string().regex(format, `${label}: invalid format`))

const decimalText = (places: number, label: string) =>
  z
    .string()
    .regex(new RegExp(`^\\d{1,13}(\\.\\d{1,${String(places)}})?$`), `${label}: decimal as text`)

const amount = decimalText(2, "Amount")
const percent = decimalText(4, "Percent").refine((v) => !dec(v).gt(dec("100")), "Percent above 100")
const optional = <T extends z.ZodType>(schema: T) => schema.nullable().default(null)

export const salesMixLineSchema = z
  .strictObject({
    operationType: z.enum(OPERATION_TYPES),
    ncm: optional(digits(CODE_FORMATS.ncm, "NCM")),
    nbs: optional(digits(CODE_FORMATS.nbs, "NBS")),
    description: optional(z.string().trim().max(200)),
    sharePercent: optional(percent),
    amount: optional(amount),
    cst: optional(digits(CODE_FORMATS.cst, "CST")),
    cClassTrib: optional(digits(CODE_FORMATS.cClassTrib, "cClassTrib")),
    destination: z.enum(DESTINATIONS),
  })
  .refine((l) => (l.sharePercent === null) !== (l.amount === null), {
    message: "Send sharePercent or amount, not both",
  })

export const purchaseLineSchema = z.strictObject({
  category: z.enum(PURCHASE_CATEGORIES),
  description: optional(z.string().trim().max(200)),
  amount,
})

/** Body of PUT /v1/clients/:id/fiscal-profile: the whole profile. Empty fields are allowed. */
export const fiscalProfileInputSchema = z
  .strictObject({
    regime: optional(z.enum(FISCAL_REGIMES)),
    /** The accountant confirms the regime (the registry only hints MEI/Simples). */
    regimeConfirmed: z.boolean().default(false),
    simplesAnnex: optional(z.enum(SIMPLES_ANNEXES)),
    rbt12: optional(amount),
    mainCnae: optional(digits(CODE_FORMATS.cnae, "CNAE")),
    secondaryCnaes: z.array(digits(CODE_FORMATS.cnae, "CNAE")).max(100).default([]),
    uf: optional(z.enum(UFS)),
    municipalityCode: optional(digits(CODE_FORMATS.municipality, "Municipality")),
    revenue12m: optional(amount),
    payroll12m: optional(amount),
    salesMix: z.array(salesMixLineSchema).max(200).default([]),
    creditablePurchases: z.array(purchaseLineSchema).max(50).default([]),
  })
  .refine(
    (p) =>
      p.uf === null || p.municipalityCode === null || p.municipalityCode.startsWith(UF_IBGE[p.uf]),
    { message: "municipalityCode does not belong to uf", path: ["municipalityCode"] },
  )
  .refine((p) => salesMixIssues(p.salesMix).length === 0, {
    message: "salesMix: use one basis; shares must total 100",
    path: ["salesMix"],
  })
  .refine((p) => !p.regimeConfirmed || p.regime !== null, {
    message: "regimeConfirmed needs a regime",
    path: ["regimeConfirmed"],
  })

export type FiscalProfileInput = z.output<typeof fiscalProfileInputSchema>

/** What completeness reads: the stored profile, or null when the client has none yet. */
export type ProfileForCompleteness = Omit<FiscalProfileInput, "regimeConfirmed"> & {
  regimeConfirmedAt: string | null
}

/** Simulation needs a profile is checked against (BE-02.4 runs only the ones it uses). */
export const PROFILE_NEEDS = ["currentTaxes", "reform", "simples", "factorR"] as const
export type ProfileNeed = (typeof PROFILE_NEEDS)[number]

export interface ProfileIssue {
  /** Field path, e.g. `regime` or `salesMix[2].cClassTrib`. */
  field: string
  problem: "missing" | "invalid" | "unconfirmed"
  detail?: string
}

/** Tolerance of the 100 % total of the shares. */
export const SHARE_TOLERANCE = "0.01"

type MixLine = Pick<z.output<typeof salesMixLineSchema>, "sharePercent" | "amount">

/** Lines use one basis; shares total 100 % within SHARE_TOLERANCE (exact decimal sum). */
export function salesMixIssues(lines: readonly MixLine[]): ProfileIssue[] {
  const shares = lines.filter((l) => l.sharePercent !== null)
  if (shares.length > 0 && shares.length < lines.length) {
    return [{ field: "salesMix", problem: "invalid", detail: "Mix of shares and amounts" }]
  }
  if (shares.length === 0) return []
  const total = sum(shares.map((l) => dec(l.sharePercent ?? "0")))
  if (total.minus(dec("100")).abs().lte(dec(SHARE_TOLERANCE))) return []
  const detail = `Shares total ${total.toFixed()} %, expected 100 %`
  return [{ field: "salesMix", problem: "invalid", detail }]
}

/**
 * Missing or invalid fields per simulation need. Pure, so BE-02.4 reuses it before simulating.
 * Codes are checked for format only (`referenceCheck: "not_verified"`): verifying them against
 * the engine's reference tables is pending (BE-03.5 cache).
 */
export function profileCompleteness(profile: ProfileForCompleteness | null): {
  complete: boolean
  needs: Record<ProfileNeed, ProfileIssue[]>
  referenceCheck: "not_verified"
} {
  const missing = (field: string): ProfileIssue => ({ field, problem: "missing" })
  const needs: Record<ProfileNeed, ProfileIssue[]> = {
    currentTaxes: [],
    reform: [],
    simples: [],
    factorR: [],
  }
  const p = profile
  const has = <K extends keyof ProfileForCompleteness>(k: K) => p !== null && p[k] !== null

  const location = [
    ...(has("uf") ? [] : [missing("uf")]),
    ...(has("municipalityCode") ? [] : [missing("municipalityCode")]),
  ]
  const lines = p?.salesMix ?? []
  const mix: ProfileIssue[] = lines.length === 0 ? [missing("salesMix")] : salesMixIssues(lines)

  if (p === null || p.regime === null) needs.currentTaxes.push(missing("regime"))
  else if (p.regimeConfirmedAt === null) {
    needs.currentTaxes.push({ field: "regime", problem: "unconfirmed" })
  }
  if (!has("mainCnae")) needs.currentTaxes.push(missing("mainCnae"))
  needs.currentTaxes.push(...location)
  if (!has("revenue12m")) needs.currentTaxes.push(missing("revenue12m"))
  needs.currentTaxes.push(...mix)

  needs.reform.push(...location, ...mix)
  lines.forEach((l, i) => {
    const code = l.operationType === "goods" ? "ncm" : "nbs"
    if (l[code] === null) needs.reform.push(missing(`salesMix[${String(i)}].${code}`))
    if (l.cClassTrib === null) needs.reform.push(missing(`salesMix[${String(i)}].cClassTrib`))
  })

  if (!has("rbt12")) needs.simples.push(missing("rbt12"))
  if (!has("simplesAnnex")) needs.simples.push(missing("simplesAnnex"))

  if (!has("payroll12m")) needs.factorR.push(missing("payroll12m"))
  if (!has("rbt12")) needs.factorR.push(missing("rbt12"))

  return {
    complete: PROFILE_NEEDS.every((n) => needs[n].length === 0),
    needs,
    referenceCheck: "not_verified",
  }
}

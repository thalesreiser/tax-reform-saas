/**
 * Consumption-tax transition schedule, 2026-2033 (EC 132/2023, ADCT arts. 125-130, and LC 214/2025).
 *
 * Data and query only: which current taxes are charged each year, the factor applied to ICMS and
 * ISS rates, and the CBS/IBS regime. CBS and IBS reference rates from 2027 are fixed every year by
 * Senate resolution (LC 214/2025, art. 349) and come from the official engine, so this module never
 * holds their values: it marks them as provisional. Simulations are built on top of it (MOT-03.2).
 */
import type Decimal from "decimal.js"
import { isTransitionYear, type TransitionYear } from "@trs/shared-types"
import { dec } from "./decimal.js"
import {
  defineRuleTable,
  isIsoDate,
  resolveRule,
  type IsoDate,
  type LegalSource,
  type ResolvedRule,
  type RuleTable,
} from "./rule-table.js"

const ADCT_URL = "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm"
const LC214_URL = "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm"

const lc214 = (provision: string, anchor: string): LegalSource => ({
  norm: "LC 214/2025",
  provision,
  url: `${LC214_URL}#${anchor}`,
})
const adct = (provision: string, anchor: string): LegalSource => ({
  norm: "EC 132/2023 (ADCT)",
  provision,
  url: `${ADCT_URL}#${anchor}`,
})

/** Calendar year as a closed validity range. */
const years = (from: number, to: number = from) => ({
  validFrom: `${String(from)}-01-01`,
  validTo: `${String(to)}-12-31`,
})

// ---------------------------------------------------------------------------------------------
// Current taxes
// ---------------------------------------------------------------------------------------------

export interface PisCofinsTransition {
  inForce: boolean
}

export interface IpiTransition {
  inForce: boolean
  /** Rates reduced to zero for every product, except the `zonaFrancaException`. */
  zeroRated: boolean
  /** Products with incentivised manufacturing in the Zona Franca de Manaus keep their IPI. */
  zonaFrancaException: boolean
}

export interface IcmsIssTransition {
  inForce: boolean
  /** Multiplier applied to the rate in the state or municipal law (1 = unchanged). */
  rateFactor: Decimal
  /** The reduced rates are the ones in force on this date, or `null` when not frozen. */
  baseRatesAsOf: IsoDate | null
}

export const PIS_COFINS_TRANSITION = defineRuleTable<PisCofinsTransition>("transition.pis-cofins", [
  {
    ...years(2026),
    // Taxpayers keep paying PIS/Cofins in full during the 2026 test year.
    source: adct("art. 126, II; LC 214/2025, art. 348, § 2º", "adctart126"),
    value: { inForce: true },
  },
  {
    ...years(2027, 2033),
    source: lc214("art. 542 (ADCT, art. 126, II)", "art542"),
    value: { inForce: false },
  },
])

export const IPI_TRANSITION = defineRuleTable<IpiTransition>("transition.ipi", [
  {
    ...years(2026),
    source: adct("art. 126, III, a (zero rates start in 2027)", "adctart126"),
    value: { inForce: true, zeroRated: false, zonaFrancaException: false },
  },
  {
    ...years(2027, 2033),
    source: lc214("art. 454 (ADCT, art. 126, III, a)", "art454"),
    value: { inForce: true, zeroRated: true, zonaFrancaException: true },
  },
])

/** ICMS (LC 87/1996, art. 31-A) and ISS (LC 116/2003, art. 8º-B) follow the same proportions. */
function icmsIssTable(tax: "icms" | "iss"): RuleTable<IcmsIssTransition> {
  const [article, anchor, law] =
    tax === "icms"
      ? (["501", "art501", "LC 87/1996, art. 31-A"] as const)
      : (["508", "art508", "LC 116/2003, art. 8º-B"] as const)
  const constitution = tax === "icms" ? "art. 155, II" : "art. 156, III"
  const reduced = (year: number, factor: string, incisos: string) => ({
    ...years(year),
    source: lc214(`art. ${article} (${law}, ${incisos}; ADCT, art. 128)`, anchor),
    value: { inForce: true, rateFactor: dec(factor), baseRatesAsOf: "2028-12-31" },
  })
  return defineRuleTable<IcmsIssTransition>(`transition.${tax}`, [
    {
      ...years(2026, 2028),
      // The reduction starts in 2029; until then the rates are those of the state/municipal law.
      source: adct(`art. 128 (CF, ${constitution})`, "adctart128"),
      value: { inForce: true, rateFactor: dec("1"), baseRatesAsOf: null },
    },
    reduced(2029, "0.9", "caput, I"),
    reduced(2030, "0.8", "caput, II"),
    reduced(2031, "0.7", "caput, III"),
    reduced(2032, "0.6", "caput, IV"),
    {
      ...years(2033),
      source: lc214(
        `art. 543, ${tax === "icms" ? "III" : "IV"} (ADCT, art. 129: tax extinct from 2033)`,
        "art543",
      ),
      value: { inForce: false, rateFactor: dec("0"), baseRatesAsOf: null },
    },
  ])
}

export const ICMS_TRANSITION = icmsIssTable("icms")
export const ISS_TRANSITION = icmsIssTable("iss")

// ---------------------------------------------------------------------------------------------
// CBS and IBS
// ---------------------------------------------------------------------------------------------

/** Rules of the 2026 test year (LC 214/2025, art. 348). */
export interface TestYearRules {
  /** Amounts paid offset PIS/Cofins due in the same period (art. 348, I). */
  offsetAgainstPisCofins: boolean
  /** Payment waived for taxpayers who meet the ancillary obligations (art. 348, § 1º). */
  paymentWaivedIfObligationsMet: boolean
  /** Test rates do not apply to Simples Nacional companies (art. 348, III, c). */
  appliesToSimplesNacional: boolean
}

const TEST_YEAR_2026: TestYearRules = Object.freeze({
  offsetAgainstPisCofins: true,
  paymentWaivedIfObligationsMet: true,
  appliesToSimplesNacional: false,
})

/** Rate fixed by the law itself: final, not provisional. Rates in percent. */
interface Statutory {
  mode: "STATUTORY"
  provisional: false
  testYear: TestYearRules | null
}

/**
 * Rate fixed every year by Senate resolution (LC 214/2025, art. 349), from TCU calculations. The
 * value comes from the official engine; it is provisional and every result must say so.
 */
interface Reference {
  mode: "REFERENCE"
  provisional: true
}

export type CbsTransition =
  | (Statutory & { rate: Decimal })
  | (Reference & {
      /** Percentage points added to the reference rate (−0.1 in 2027-2028, except fuels). */
      adjustmentPercentagePoints: Decimal
    })

export type IbsTransition = (Statutory & { stateRate: Decimal; municipalRate: Decimal }) | Reference

const STATUTORY = { mode: "STATUTORY", provisional: false } as const
const REFERENCE = { mode: "REFERENCE", provisional: true } as const

export const CBS_TRANSITION = defineRuleTable<CbsTransition>("transition.cbs", [
  {
    ...years(2026),
    source: lc214("art. 346 and art. 348 (ADCT, art. 125)", "art346"),
    value: { ...STATUTORY, rate: dec("0.9"), testYear: TEST_YEAR_2026 },
  },
  {
    ...years(2027, 2028),
    // The −0.1 p.p. does not apply to fuels under the specific regime (LC 214/2025, arts. 172-180).
    source: lc214("art. 347 and art. 349, I (ADCT, art. 127, sole paragraph)", "art347"),
    value: { ...REFERENCE, adjustmentPercentagePoints: dec("-0.1") },
  },
  {
    ...years(2029, 2033),
    source: lc214("art. 349, I, and arts. 355 to 359 (ADCT, art. 130, I)", "art349"),
    value: { ...REFERENCE, adjustmentPercentagePoints: dec("0") },
  },
])

export const IBS_TRANSITION = defineRuleTable<IbsTransition>("transition.ibs", [
  {
    ...years(2026),
    // Only a state rate is charged in 2026.
    source: lc214("art. 343 and art. 348 (ADCT, art. 125)", "art343"),
    value: {
      ...STATUTORY,
      stateRate: dec("0.1"),
      municipalRate: dec("0"),
      testYear: TEST_YEAR_2026,
    },
  },
  {
    ...years(2027, 2028),
    source: lc214("art. 344 (ADCT, art. 127)", "art344"),
    value: { ...STATUTORY, stateRate: dec("0.05"), municipalRate: dec("0.05"), testYear: null },
  },
  {
    ...years(2029, 2032),
    source: lc214("art. 349, II, and arts. 361 to 364 (ADCT, art. 130, II and III)", "art349"),
    value: REFERENCE,
  },
  {
    ...years(2033),
    source: lc214("art. 349, II, and art. 365 (ADCT, art. 130, II and III)", "art349"),
    value: REFERENCE,
  },
])

export const TRANSITION_TABLES: readonly RuleTable<unknown>[] = [
  PIS_COFINS_TRANSITION,
  IPI_TRANSITION,
  ICMS_TRANSITION,
  ISS_TRANSITION,
  CBS_TRANSITION,
  IBS_TRANSITION,
]

// ---------------------------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------------------------

export interface TransitionRules {
  year: TransitionYear
  /** Date the rules were resolved for (1 January when queried by year). */
  date: IsoDate
  pis: ResolvedRule<PisCofinsTransition>
  cofins: ResolvedRule<PisCofinsTransition>
  ipi: ResolvedRule<IpiTransition>
  icms: ResolvedRule<IcmsIssTransition>
  iss: ResolvedRule<IcmsIssTransition>
  cbs: ResolvedRule<CbsTransition>
  ibs: ResolvedRule<IbsTransition>
  /** Every table version used (`<table>@<validFrom>`), to store with a result (RNF-05). */
  ruleVersions: string[]
}

/**
 * Transition rules in force for a year (2026-2033) or a date inside it. Throws `RangeError` for
 * anything outside the transition or an invalid date.
 */
export function transitionRules(when: number | IsoDate): TransitionRules {
  const date = typeof when === "number" ? yearStart(when) : when
  if (!isIsoDate(date)) throw new RangeError(`Invalid date "${date}"`)
  const year = Number(date.slice(0, 4))
  if (!isTransitionYear(year)) {
    throw new RangeError(`${date} is outside the 2026-2033 transition`)
  }

  const pis = resolveRule(PIS_COFINS_TRANSITION, date)
  const rules = {
    pis,
    cofins: pis,
    ipi: resolveRule(IPI_TRANSITION, date),
    icms: resolveRule(ICMS_TRANSITION, date),
    iss: resolveRule(ISS_TRANSITION, date),
    cbs: resolveRule(CBS_TRANSITION, date),
    ibs: resolveRule(IBS_TRANSITION, date),
  }
  const ruleVersions = [...new Set(Object.values(rules).map((r) => r.versionId))]
  return { year, date, ...rules, ruleVersions }
}

function yearStart(year: number): IsoDate {
  if (!isTransitionYear(year)) {
    throw new RangeError(`${String(year)} is outside the 2026-2033 transition`)
  }
  return `${String(year)}-01-01`
}

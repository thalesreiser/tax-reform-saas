/**
 * Rule tables versioned by validity date. Every value that comes from the law (a rate, a bracket,
 * a limit) lives in a table whose versions say when they were in force and where they come from,
 * so a simulation for any date can be reproduced and audited.
 */

/** Calendar date in ISO form, `YYYY-MM-DD`. */
export type IsoDate = string

/** Where a rule comes from. `norm` is mandatory; never add a rule without its source. */
export interface LegalSource {
  /** e.g. "LC 123/2006" or "LC 214/2025". */
  norm: string
  /** e.g. "Anexo III" or "art. 8º, § 1º". */
  provision?: string
  url?: string
}

export interface RuleVersion<T> {
  /** First day in force (inclusive). */
  validFrom: IsoDate
  /** Last day in force (inclusive); omitted while the version is current. */
  validTo?: IsoDate
  source: LegalSource
  value: T
}

export interface RuleTable<T> {
  /** Stable identifier, e.g. "iss.rate-limits". */
  id: string
  versions: readonly RuleVersion<T>[]
}

export interface ResolvedRule<T> {
  value: T
  source: LegalSource
  /** `<table id>@<validFrom>`: recorded with every stored result (RNF-05). */
  versionId: string
}

export class RuleTableError extends Error {
  override name = "RuleTableError"
}

export class NoRuleInForceError extends Error {
  override name = "NoRuleInForceError"
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}

/**
 * Validates and freezes a table: at least one version, valid dates, `validTo >= validFrom`,
 * versions in ascending order, no overlaps, a non-empty legal source, and only the last version
 * may be open-ended. Gaps are allowed (a period with no rule) and fail at resolution time.
 */
export function defineRuleTable<T>(id: string, versions: readonly RuleVersion<T>[]): RuleTable<T> {
  const fail = (message: string): never => {
    throw new RuleTableError(`${id}: ${message}`)
  }
  if (id.trim() === "") throw new RuleTableError("table id is empty")
  if (versions.length === 0) fail("no versions")

  versions.forEach((v, i) => {
    if (!isIsoDate(v.validFrom)) fail(`version ${i}: invalid validFrom "${v.validFrom}"`)
    if (v.validTo !== undefined) {
      if (!isIsoDate(v.validTo)) fail(`version ${i}: invalid validTo "${v.validTo}"`)
      if (v.validTo < v.validFrom) fail(`version ${i}: validTo before validFrom`)
    } else if (i < versions.length - 1) {
      fail(`version ${i}: only the last version may be open-ended`)
    }
    if (v.source.norm.trim() === "") fail(`version ${i}: legal source is empty`)

    const previous = versions[i - 1]
    if (previous) {
      if (v.validFrom <= previous.validFrom) fail(`version ${i}: versions out of order`)
      if (previous.validTo !== undefined && v.validFrom <= previous.validTo) {
        fail(`version ${i}: overlaps version ${i - 1}`)
      }
    }
  })

  return Object.freeze({ id, versions: Object.freeze([...versions]) })
}

/** Returns the version in force on `date`, or throws `NoRuleInForceError`. */
export function resolveRule<T>(table: RuleTable<T>, date: IsoDate): ResolvedRule<T> {
  if (!isIsoDate(date)) throw new RangeError(`Invalid date "${date}"`)
  const version = table.versions.find(
    (v) => v.validFrom <= date && (v.validTo === undefined || date <= v.validTo),
  )
  if (!version) throw new NoRuleInForceError(`${table.id}: no rule in force on ${date}`)
  return {
    value: version.value,
    source: version.source,
    versionId: `${table.id}@${version.validFrom}`,
  }
}

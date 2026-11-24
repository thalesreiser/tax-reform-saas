/**
 * Browser origins allowed to call the API with credentials (CORS) and trusted by better-auth's
 * origin check: `WEB_URL` plus `CORS_EXTRA_ORIGINS`.
 *
 * An entry is an exact origin (`https://app.example.com`, no path) or one https wildcard pattern
 * whose `*` is the start of the host, followed by `-` or `.`, e.g.
 * `https://*-trs-web.thausreiser.workers.dev` for Cloudflare preview hosts. The `*` matches one
 * DNS label fragment (letters, digits, inner hyphens; never a dot), and the fixed part must have at
 * least three labels, so a pattern cannot cover a whole public suffix (`https://*.dev`) and a
 * look-alike host (`x.evil-trs-web…`, `…workers.dev.evil.com`) never matches.
 */
export interface OriginPolicy {
  exact: ReadonlySet<string>
  patterns: readonly RegExp[]
}

const LABEL_FRAGMENT = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/

/** The origin of an exact entry, or undefined when it is not a bare http(s) origin. */
function exactOrigin(entry: string): string | undefined {
  try {
    const url = new URL(entry)
    const bare = url.pathname === "/" && url.search === "" && url.hash === "" && !url.username
    return (url.protocol === "https:" || url.protocol === "http:") && bare ? url.origin : undefined
  } catch {
    return undefined
  }
}

function wildcardPattern(entry: string): RegExp | undefined {
  const match = /^https:\/\/\*([.-])([^*/:?#]+)$/.exec(entry.toLowerCase())
  if (match === null) return undefined
  const [, separator = "", rest = ""] = match
  if (!HOST.test(rest) || rest.split(".").length < 3) return undefined
  const fixed = `${separator}${rest}`.replaceAll(".", "\\.")
  return new RegExp(`^https://${LABEL_FRAGMENT}${fixed}$`)
}

/** Parses one entry; throws with the entry's position, never its value. */
export function parseOriginEntry(entry: string): string | RegExp {
  const parsed = entry.includes("*") ? wildcardPattern(entry) : exactOrigin(entry)
  if (parsed === undefined) throw new Error("not an origin or an allowed wildcard pattern")
  return parsed
}

export function originPolicy(entries: readonly (string | RegExp)[]): OriginPolicy {
  return {
    exact: new Set(entries.filter((e): e is string => typeof e === "string")),
    patterns: entries.filter((e): e is RegExp => e instanceof RegExp),
  }
}

/** True when the `Origin` header value is allowed (case-insensitive host, exact scheme and port). */
export function isAllowedOrigin(origin: string | undefined, policy: OriginPolicy): boolean {
  if (origin === undefined || origin === "" || origin === "null") return false
  const normalised = exactOrigin(origin)
  if (normalised === undefined || normalised !== origin.toLowerCase()) return false
  return policy.exact.has(normalised) || policy.patterns.some((p) => p.test(normalised))
}

/** The policy of a running API: WEB_URL (as an origin) plus CORS_EXTRA_ORIGINS. */
export function configOriginPolicy(config: {
  WEB_URL?: string | undefined
  CORS_EXTRA_ORIGINS: readonly (string | RegExp)[]
}): OriginPolicy {
  const web = config.WEB_URL === undefined ? [] : [new URL(config.WEB_URL).origin]
  return originPolicy([...web, ...config.CORS_EXTRA_ORIGINS])
}

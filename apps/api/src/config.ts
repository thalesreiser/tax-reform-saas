import { z } from "zod"
import { parseOriginEntry } from "./origins.js"

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/, error: "Must be a postgres:// URL" })

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** Set by the deploy pipeline (git tag or commit); shown by /health. */
  APP_VERSION: z.string().min(1).default("dev"),
  /** Application role (a login member of `trs_app`, subject to row-level security). */
  DATABASE_URL: postgresUrl,
  /** Owner role, used only by `db:migrate`; never given to the running API. */
  DATABASE_MIGRATION_URL: postgresUrl.optional(),
  /** Signs and encrypts session cookies and tokens. At least 32 characters, random per environment. */
  BETTER_AUTH_SECRET: z.string().min(32, "Must be at least 32 characters"),
  /** Public URL of this API (scheme, host, optional port); auth links and cookies are built on it. */
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/, error: "Must be an http(s) URL" }),
  /** Public URL of the web app: trusted origin for auth requests and base of e-mail links. */
  WEB_URL: z.url({ protocol: /^https?$/, error: "Must be an http(s) URL" }).optional(),
  /**
   * More browser origins allowed besides WEB_URL (CORS and auth origin check), comma-separated:
   * exact origins and https wildcard patterns such as `https://*-trs-web.example.workers.dev`
   * (rules in src/origins.ts). Parsed into origins and patterns.
   */
  CORS_EXTRA_ORIGINS: z
    .string()
    .optional()
    .transform((value, ctx) => {
      const entries = (value ?? "")
        .split(",")
        .map((e) => e.trim())
        .filter((e) => e !== "")
      return entries.flatMap((entry, index) => {
        try {
          return [parseOriginEntry(entry)]
        } catch {
          ctx.addIssue({ code: "custom", message: `Entry ${index + 1} is not an allowed origin` })
          return []
        }
      })
    }),
  /**
   * Reverse proxies in front of the API whose X-Forwarded-For entry is trusted for the client
   * address (rate limits). 0 trusts none; 1 behind Fly.io's proxy, which appends the client address.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  /** Base URL of the official regime-regular engine (private network). */
  ENGINE_REGIME_REGULAR_URL: z
    .url({ protocol: /^https?$/, error: "Must be an http(s) URL" })
    .optional(),
  /** Base URL of the official Simples Nacional engine (private network). */
  ENGINE_SIMPLES_NACIONAL_URL: z
    .url({ protocol: /^https?$/, error: "Must be an http(s) URL" })
    .optional(),
  /** Per-call engine timeout; an engine on Flycast takes about 25 s to wake from a stop. */
  ENGINE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),
  /** How long reference data (CST, NCM, rates...) stays in the API's in-process cache. */
  REFERENCE_CACHE_TTL_SECONDS: z.coerce.number().int().min(1).max(604_800).default(21_600),
  /** Sentry project DSN; error tracking is off when unset (see deploy/README.md, Observability). */
  SENTRY_DSN: z.url({ protocol: /^https$/, error: "Must be an https URL" }).optional(),
  /** Environment name shown in Sentry (staging, production). */
  SENTRY_ENVIRONMENT: z.string().min(1).default("development"),
  /** Share of requests traced for performance; 0 (default) sends errors only. */
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
})

export type Config = z.output<typeof configSchema>

export class ConfigError extends Error {
  override name = "ConfigError"
}

function parse<T extends z.ZodType>(schema: T, env: NodeJS.ProcessEnv): z.output<T> {
  const result = schema.safeParse(env)
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
    throw new ConfigError(`Invalid configuration:\n- ${problems.join("\n- ")}`)
  }
  return result.data
}

/**
 * Reads and validates the environment once, at start-up. An invalid value stops the process with
 * the variable name and the reason, never the value (it may be a secret).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return parse(configSchema, env)
}

/** Only what `db:migrate` needs, so the deploy pipeline does not hold the API's secrets. */
export function loadMigrationConfig(env: NodeJS.ProcessEnv = process.env) {
  return parse(configSchema.pick({ DATABASE_MIGRATION_URL: true }), env)
}

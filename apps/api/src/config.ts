import { z } from "zod"

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

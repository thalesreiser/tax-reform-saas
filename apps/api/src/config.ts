import { z } from "zod"

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** Set by the deploy pipeline (git tag or commit); shown by /health. */
  APP_VERSION: z.string().min(1).default("dev"),
})

export type Config = z.output<typeof configSchema>

export class ConfigError extends Error {
  override name = "ConfigError"
}

/**
 * Reads and validates the environment once, at start-up. An invalid value stops the process with
 * the variable name and the reason, never the value (it may be a secret).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env)
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
    throw new ConfigError(`Invalid configuration:\n- ${problems.join("\n- ")}`)
  }
  return result.data
}

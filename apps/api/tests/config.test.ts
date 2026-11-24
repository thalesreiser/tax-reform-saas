import { describe, expect, it } from "vitest"
import { ConfigError, loadConfig, loadMigrationConfig } from "../src/config.js"

// Fictional values: the secret is a test placeholder, never a real one.
const REQUIRED = {
  DATABASE_URL: "postgres://trs_api@db.example:5432/trs",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0000",
  BETTER_AUTH_URL: "http://localhost:3000",
}

describe("loadConfig", () => {
  it("applies defaults", () => {
    expect(loadConfig(REQUIRED)).toEqual({
      ...REQUIRED,
      NODE_ENV: "development",
      HOST: "0.0.0.0",
      PORT: 3000,
      LOG_LEVEL: "info",
      APP_VERSION: "dev",
      TRUST_PROXY_HOPS: 0,
      ENGINE_TIMEOUT_MS: 30_000,
      REFERENCE_CACHE_TTL_SECONDS: 21_600,
      CNPJ_LOOKUP_URL: "https://brasilapi.com.br/api/cnpj/v1",
      CNPJ_LOOKUP_TIMEOUT_MS: 8000,
      CORS_EXTRA_ORIGINS: [],
      SENTRY_ENVIRONMENT: "development",
      SENTRY_TRACES_SAMPLE_RATE: 0,
    })
  })

  it("reads the proxy hops and engine URLs", () => {
    const config = loadConfig({
      ...REQUIRED,
      TRUST_PROXY_HOPS: "1",
      ENGINE_REGIME_REGULAR_URL: "http://engine-rr.example:8080",
      ENGINE_SIMPLES_NACIONAL_URL: "http://engine-sn.example:8082",
    })
    expect(config.TRUST_PROXY_HOPS).toBe(1)
    expect(config.ENGINE_REGIME_REGULAR_URL).toBe("http://engine-rr.example:8080")
    expect(config.ENGINE_SIMPLES_NACIONAL_URL).toBe("http://engine-sn.example:8082")
  })

  it("rejects a negative proxy hop count", () => {
    expect(() => loadConfig({ ...REQUIRED, TRUST_PROXY_HOPS: "-1" })).toThrow("TRUST_PROXY_HOPS")
  })

  it("coerces the port", () => {
    expect(loadConfig({ ...REQUIRED, PORT: "8080" }).PORT).toBe(8080)
  })

  it.each(Object.keys(REQUIRED))("requires %s", (name) => {
    const env: Record<string, string> = { ...REQUIRED }
    delete env[name]
    expect(() => loadConfig(env)).toThrow(name)
  })

  it("accepts postgres URLs for the database", () => {
    const config = loadConfig({
      ...REQUIRED,
      DATABASE_URL: "postgres://trs_api@db.example:5432/trs",
      DATABASE_MIGRATION_URL: "postgresql://trs_owner@db.example/trs",
    })
    expect(config.DATABASE_URL).toBe("postgres://trs_api@db.example:5432/trs")
    expect(config.DATABASE_MIGRATION_URL).toBe("postgresql://trs_owner@db.example/trs")
  })

  it.each([
    ["PORT", "abc"],
    ["PORT", "70000"],
    ["NODE_ENV", "staging"],
    ["LOG_LEVEL", "verbose"],
    ["DATABASE_URL", "mysql://db.example/trs"],
    ["DATABASE_MIGRATION_URL", "not-a-url"],
    ["BETTER_AUTH_SECRET", "too-short-secret"],
    ["BETTER_AUTH_URL", "ftp://auth.example"],
    ["WEB_URL", "not-a-url"],
    ["CORS_EXTRA_ORIGINS", "https://*.dev"],
    ["CORS_EXTRA_ORIGINS", "https://app.example.test/path"],
  ])("rejects %s=%s naming the variable but not the value", (name, value) => {
    const run = () => loadConfig({ ...REQUIRED, [name]: value })
    expect(run).toThrow(ConfigError)
    expect(run).toThrow(name)
    expect(run).not.toThrow(new RegExp(`"${value}"`))
  })
})

describe("CORS_EXTRA_ORIGINS", () => {
  it("parses exact origins and wildcard patterns", () => {
    const [exact, pattern] = loadConfig({
      ...REQUIRED,
      CORS_EXTRA_ORIGINS: " https://Preview.Example.test , https://*-web.acct.workers.test",
    }).CORS_EXTRA_ORIGINS
    expect(exact).toBe("https://preview.example.test")
    expect(pattern).toBeInstanceOf(RegExp)
  })
})

describe("loadMigrationConfig", () => {
  it("needs none of the API's secrets", () => {
    expect(
      loadMigrationConfig({ DATABASE_MIGRATION_URL: "postgres://trs_owner@db.example/trs" }),
    ).toEqual({
      DATABASE_MIGRATION_URL: "postgres://trs_owner@db.example/trs",
    })
  })
})

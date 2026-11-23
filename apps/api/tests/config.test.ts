import { describe, expect, it } from "vitest"
import { ConfigError, loadConfig } from "../src/config.js"

describe("loadConfig", () => {
  it("applies defaults", () => {
    expect(loadConfig({})).toEqual({
      NODE_ENV: "development",
      HOST: "0.0.0.0",
      PORT: 3000,
      LOG_LEVEL: "info",
      APP_VERSION: "dev",
    })
  })

  it("coerces the port", () => {
    expect(loadConfig({ PORT: "8080" }).PORT).toBe(8080)
  })

  it("accepts postgres URLs for the database", () => {
    const config = loadConfig({
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
  ])("rejects %s=%s naming the variable but not the value", (name, value) => {
    const run = () => loadConfig({ [name]: value })
    expect(run).toThrow(ConfigError)
    expect(run).toThrow(name)
    expect(run).not.toThrow(new RegExp(`"${value}"`))
  })
})

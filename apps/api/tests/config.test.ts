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

  it.each([
    ["PORT", "abc"],
    ["PORT", "70000"],
    ["NODE_ENV", "staging"],
    ["LOG_LEVEL", "verbose"],
  ])("rejects %s=%s naming the variable but not the value", (name, value) => {
    const run = () => loadConfig({ [name]: value })
    expect(run).toThrow(ConfigError)
    expect(run).toThrow(name)
    expect(run).not.toThrow(new RegExp(`"${value}"`))
  })
})

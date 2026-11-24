import { describe, expect, it } from "vitest"
import {
  configOriginPolicy,
  isAllowedOrigin,
  originPolicy,
  parseOriginEntry,
} from "../src/origins.js"

const policy = originPolicy([
  parseOriginEntry("https://web.example.test"),
  parseOriginEntry("https://*-trs-web.acct.workers.test"),
])

describe("origin policy", () => {
  it.each([
    "https://web.example.test",
    "https://abc123-trs-web.acct.workers.test",
    "https://feat-x-1-trs-web.acct.workers.test",
  ])("allows %s", (origin) => {
    expect(isAllowedOrigin(origin, policy)).toBe(true)
  })

  it.each([
    undefined,
    "",
    "null",
    "http://web.example.test",
    "https://web.example.test:8443",
    "https://web.example.test.evil.test",
    "https://evilweb.example.test",
    "https://trs-web.acct.workers.test",
    "https://a.b-trs-web.acct.workers.test",
    "https://x-trs-web.acct.workers.test.evil.test",
    "https://x-evil-trs-web.acct.workers.test/",
    "http://x-trs-web.acct.workers.test",
    "https://x-trs-webacct.workers.test",
    "https://-trs-web.acct.workers.test",
    "https://user@web.example.test",
  ])("rejects %s", (origin) => {
    expect(isAllowedOrigin(origin, policy)).toBe(false)
  })

  it.each([
    "https://*.dev",
    "https://*.workers.dev",
    "http://*-web.acct.workers.test",
    "https://web.*.example.test",
    "https://**.acct.workers.test",
    "https://*-web.acct.workers.test/path",
    "https://*-web.acct.workers.test:8443",
    "https://web.example.test/path",
    "ftp://web.example.test",
    "not an origin",
  ])("refuses the entry %s", (entry) => {
    expect(() => parseOriginEntry(entry)).toThrow()
  })

  it("uses the origin of WEB_URL", () => {
    const fromConfig = configOriginPolicy({
      WEB_URL: "https://web.example.test/",
      CORS_EXTRA_ORIGINS: [],
    })
    expect([...fromConfig.exact]).toEqual(["https://web.example.test"])
    expect(configOriginPolicy({ CORS_EXTRA_ORIGINS: [] }).exact.size).toBe(0)
  })
})

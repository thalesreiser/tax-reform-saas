import { describe, expect, it } from "vitest"
import {
  type ProfileForCompleteness,
  fiscalProfileInputSchema,
  profileCompleteness,
  salesMixIssues,
} from "../src/clients/fiscal-profile.js"

// Fictional profile: codes have the right shape; they are not a classification of any company.
const line = {
  operationType: "goods",
  ncm: "8471.30.12",
  sharePercent: "60.0000",
  cClassTrib: "000001",
  cst: "000",
  destination: "intrastate",
}
const service = {
  operationType: "services",
  nbs: "1.0101.10.00",
  sharePercent: "40",
  cClassTrib: "000001",
  destination: "interstate",
}
const body = {
  regime: "simples_nacional",
  regimeConfirmed: true,
  simplesAnnex: "III",
  rbt12: "480000.00",
  mainCnae: "6201-5/01",
  uf: "RJ",
  municipalityCode: "3304557",
  revenue12m: "480000",
  payroll12m: "150000.00",
  salesMix: [line, service],
  creditablePurchases: [{ category: "inputs", amount: "1000.50" }],
}

const parse = (input: unknown) => fiscalProfileInputSchema.safeParse(input)
function stored(input: unknown, confirmedAt: string | null = "2026-11-24T00:00:00.000Z") {
  const profile: ProfileForCompleteness = {
    ...fiscalProfileInputSchema.parse(input),
    regimeConfirmedAt: confirmedAt,
  }
  return profile
}

describe("fiscal profile input (RF-03)", () => {
  it("accepts a full profile and strips punctuation from codes", () => {
    const result = parse(body)
    expect(result.success).toBe(true)
    expect(result.data?.mainCnae).toBe("6201501")
    expect(result.data?.salesMix[0]?.ncm).toBe("84713012")
    expect(result.data?.salesMix[1]?.nbs).toBe("101011000")
  })

  it("accepts an empty draft", () => {
    expect(parse({}).success).toBe(true)
  })

  it.each([
    ["mainCnae", "620150"],
    ["municipalityCode", "330455"],
    ["uf", "XX"],
    ["regime", "lucro_arbitrado"],
    ["simplesAnnex", "VI"],
    ["revenue12m", "1000,00"],
    ["revenue12m", "1e6"],
    ["rbt12", "10.123"],
  ])("rejects %s = %s", (field, value) => {
    expect(parse({ ...body, [field]: value }).success).toBe(false)
  })

  it("rejects amounts sent as JSON numbers", () => {
    expect(parse({ ...body, revenue12m: 480000 }).success).toBe(false)
  })

  it.each([
    ["ncm", "8471301"],
    ["cClassTrib", "00001"],
    ["cst", "0000"],
    ["sharePercent", "60.00001"],
    ["sharePercent", "100.0001"],
  ])("rejects a mix line with %s = %s", (field, value) => {
    expect(parse({ ...body, salesMix: [{ ...line, [field]: value }, service] }).success).toBe(false)
  })

  it("rejects a municipality outside the UF", () => {
    expect(parse({ ...body, uf: "SP" }).success).toBe(false)
  })

  it("rejects a line with both share and amount, and a confirmation without regime", () => {
    expect(parse({ ...body, salesMix: [{ ...line, amount: "10.00" }] }).success).toBe(false)
    expect(parse({ ...body, regime: null }).success).toBe(false)
  })

  it("rejects unknown fields", () => {
    expect(parse({ ...body, cnpj: "TEST0000000001" }).success).toBe(false)
  })
})

describe("sales mix totals", () => {
  const shares = (...values: string[]) => values.map((v) => ({ sharePercent: v, amount: null }))

  it("accepts 100 % within 0.01 with exact decimals", () => {
    expect(salesMixIssues(shares("33.3333", "33.3333", "33.3333"))).toEqual([])
    expect(salesMixIssues(shares("50.0050", "50.0050"))).toEqual([])
    expect(salesMixIssues(shares("0.1", "0.2", "99.7"))).toEqual([])
  })

  it("rejects totals off by more than 0.01", () => {
    expect(salesMixIssues(shares("50", "49.9899"))).toEqual([
      expect.objectContaining({ field: "salesMix", problem: "invalid" }),
    ])
    expect(salesMixIssues(shares("50.0051", "50.0050"))).toHaveLength(1)
  })

  it("accepts amounts without a total and rejects mixed bases", () => {
    expect(salesMixIssues([{ sharePercent: null, amount: "10.00" }])).toEqual([])
    expect(salesMixIssues([...shares("100"), { sharePercent: null, amount: "1.00" }])).toHaveLength(
      1,
    )
  })

  it("is enforced on input", () => {
    expect(parse({ ...body, salesMix: [line] }).success).toBe(false)
  })
})

describe("profileCompleteness", () => {
  it("is complete for a full, confirmed profile", () => {
    expect(profileCompleteness(stored(body))).toEqual({
      complete: true,
      needs: { currentTaxes: [], reform: [], simples: [], factorR: [] },
      referenceCheck: "not_verified",
    })
  })

  it("lists every need of a missing profile", () => {
    const result = profileCompleteness(null)
    expect(result.complete).toBe(false)
    expect(result.needs.currentTaxes.map((i) => i.field)).toEqual([
      "regime",
      "mainCnae",
      "uf",
      "municipalityCode",
      "revenue12m",
      "salesMix",
    ])
    expect(result.needs.reform.map((i) => i.field)).toEqual(["uf", "municipalityCode", "salesMix"])
    expect(result.needs.simples.map((i) => i.field)).toEqual(["rbt12", "simplesAnnex"])
    expect(result.needs.factorR.map((i) => i.field)).toEqual(["payroll12m", "rbt12"])
  })

  it("asks for the accountant's confirmation of the regime", () => {
    const result = profileCompleteness(stored(body, null))
    expect(result.needs.currentTaxes).toEqual([{ field: "regime", problem: "unconfirmed" }])
  })

  it("names the line and code the engine still needs", () => {
    const result = profileCompleteness(
      stored({
        ...body,
        salesMix: [
          { ...line, ncm: null, cClassTrib: null },
          { ...service, nbs: null },
        ],
      }),
    )
    expect(result.needs.reform).toEqual([
      { field: "salesMix[0].ncm", problem: "missing" },
      { field: "salesMix[0].cClassTrib", problem: "missing" },
      { field: "salesMix[1].nbs", problem: "missing" },
    ])
    expect(result.needs.currentTaxes).toEqual([])
  })

  it("keeps factor R separate when payroll is optional and absent", () => {
    const result = profileCompleteness(stored({ ...body, payroll12m: null }))
    expect(result.needs.factorR).toEqual([{ field: "payroll12m", problem: "missing" }])
    expect(result.needs.currentTaxes).toEqual([])
  })
})

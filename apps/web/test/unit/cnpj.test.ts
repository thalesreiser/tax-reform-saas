import { describe, expect, it } from "vitest"
import {
  cnpjCheckDigits,
  cnpjInputState,
  formatCnpj,
  isValidCnpj,
  normalizeCnpj,
} from "../../app/utils/cnpj"

// Same vectors as apps/api/tests/cnpj.test.ts, so the web copy stays in step with the API.
// Generated CNPJs only; 12ABC34501DE35 is the Receita Federal's worked example.
const NUMERIC = "11222333000181"
const ALPHA = "12ABC34501DE35"

describe("CNPJ validation (web copy of the API rules)", () => {
  it.each([NUMERIC, ALPHA, "ABCDEFGH000195", "TESTE000000161"])("accepts %s", (cnpj) => {
    expect(isValidCnpj(cnpj)).toBe(true)
  })

  it("computes the official example's check digits (ASCII - 48)", () => {
    expect(cnpjCheckDigits("12ABC34501DE")).toBe("35")
    expect(cnpjCheckDigits("112223330001")).toBe("81")
    expect(() => cnpjCheckDigits("1234")).toThrow(RangeError)
  })

  it.each([
    "11222333000191",
    "11222333000182",
    "12ABC34501DE36",
    "12ABC34501DE3A",
    "12abc34501de35",
    "1122233300018",
    "112223330001811",
    "00000000000000",
    "11111111111111",
    "11222333#00181",
    "",
  ])("rejects %s", (cnpj) => {
    expect(isValidCnpj(cnpj)).toBe(false)
  })

  it("normalises the mask and the case", () => {
    expect(normalizeCnpj("11.222.333/0001-81")).toBe(NUMERIC)
    expect(normalizeCnpj(" 12.abc.345/01de-35 ")).toBe(ALPHA)
  })
})

describe("CNPJ mask while typing", () => {
  it.each([
    ["", ""],
    ["11", "11"],
    ["112", "11.2"],
    ["11222333", "11.222.333"],
    ["112223330001", "11.222.333/0001"],
    [NUMERIC, "11.222.333/0001-81"],
    ["12abc34501de35", "12.ABC.345/01DE-35"],
    ["11.222.333/0001-8199", "11.222.333/0001-81"],
    ["11#222", "11.222"],
  ])("%s -> %s", (input, masked) => {
    expect(formatCnpj(input)).toBe(masked)
  })

  it.each([
    ["", "empty"],
    ["11.222", "incomplete"],
    ["11.222.333/0001-81", "valid"],
    ["12.abc.345/01de-35", "valid"],
    ["11.222.333/0001-82", "invalid"],
    ["11#222", "invalid"],
  ])("state of %s is %s", (input, state) => {
    expect(cnpjInputState(input)).toBe(state)
  })
})

import { dec, Fiscal } from "@trs/tax-legacy"
import { describe, expect, it } from "vitest"
import { decimalize, InvalidDecimalError, toWire, type DecimalShapes } from "../src/decimals.js"

const shapes: DecimalShapes = {
  Total: { props: { vBC: "decimal", itens: { items: { ref: "Item" } } } },
  Item: { props: { vCBS: "decimal" } },
}

describe("decimalize", () => {
  it("converts only the decimal fields of the shape", () => {
    const parsed = decimalize(
      { vBC: "1200.00", CST: "200", nObj: 3, itens: [{ vCBS: "42.24", cClassTrib: "200028" }] },
      { ref: "Total" },
      shapes,
    ) as {
      vBC: unknown
      CST: unknown
      nObj: unknown
      itens: { vCBS: unknown; cClassTrib: unknown }[]
    }

    expect(Fiscal.isDecimal(parsed.vBC)).toBe(true)
    expect(parsed.CST).toBe("200")
    expect(parsed.nObj).toBe(3)
    expect(parsed.itens[0]?.vCBS).toEqual(dec("42.24"))
    expect(parsed.itens[0]?.cClassTrib).toBe("200028")
  })

  it("keeps absent and null fields", () => {
    expect(decimalize({ vBC: null }, { ref: "Total" }, shapes)).toEqual({ vBC: null })
    expect(decimalize({}, { ref: "Total" }, shapes)).toEqual({})
  })

  it("accepts JSON numbers with up to 15 significant digits", () => {
    expect(decimalize(0.1, "decimal", shapes)).toEqual(dec("0.1"))
    expect(decimalize(1234567890123.45, "decimal", shapes)).toEqual(dec("1234567890123.45"))
  })

  it("rejects numbers that may have lost precision and text that is not a decimal", () => {
    expect(() => decimalize(0.1 + 0.2, "decimal", shapes)).toThrow(InvalidDecimalError)
    expect(() => decimalize(1e-7, "decimal", shapes)).toThrow(InvalidDecimalError)
    expect(() => decimalize("1.200,00", "decimal", shapes)).toThrow(InvalidDecimalError)
    expect(() => decimalize(true, "decimal", shapes)).toThrow(InvalidDecimalError)
  })
})

describe("toWire", () => {
  it("writes decimals as plain text, without exponent", () => {
    expect(toWire({ a: dec("0.00000001"), b: [dec("1200.50")], c: "200", d: 3 })).toEqual({
      a: "0.00000001",
      b: ["1200.5"],
      c: "200",
      d: 3,
    })
  })
})

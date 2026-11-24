import { describe, expect, it } from "vitest"
import { brandColorSchema, brandContrast, relativeLuminance } from "../src/office/brand-color.js"
import { LOGO_MAX_BYTES, LogoError, validateLogo } from "../src/office/logo.js"
import { leavesNoOwner } from "../src/office/members.js"

/** Minimal PNG: signature and IHDR (enough for the validator, which reads only the header). */
function png(width: number, height: number, padTo = 0): Buffer {
  const ihdr = Buffer.alloc(25)
  ihdr.writeUInt32BE(13, 0)
  ihdr.write("IHDR", 4, "latin1")
  ihdr.writeUInt32BE(width, 8)
  ihdr.writeUInt32BE(height, 12)
  const head = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr])
  return padTo > head.length ? Buffer.concat([head, Buffer.alloc(padTo - head.length)]) : head
}

function jpeg(width: number, height: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00])
  const sof = Buffer.alloc(11)
  sof.writeUInt16BE(0xffc0, 0)
  sof.writeUInt16BE(9, 2)
  sof[4] = 8
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof])
}

function webp(width: number, height: number): Buffer {
  const data = Buffer.alloc(30)
  data.write("RIFF", 0, "latin1")
  data.writeUInt32LE(22, 4)
  data.write("WEBPVP8X", 8, "latin1")
  data.writeUInt32LE(10, 16)
  data.writeUIntLE(width - 1, 24, 3)
  data.writeUIntLE(height - 1, 27, 3)
  return data
}

const status = (run: () => unknown) => {
  try {
    run()
    return "ok"
  } catch (error) {
    return error instanceof LogoError ? error.statusCode : "other"
  }
}

describe("brand colour", () => {
  it("accepts #RRGGBB in any case and stores it upper-case", () => {
    expect(brandColorSchema.parse("#1a2b3c")).toBe("#1A2B3C")
  })

  it.each(["1A2B3C", "#123", "#12345G", "red", "#1A2B3C00", "url(x)"])("rejects %s", (value) => {
    expect(brandColorSchema.safeParse(value).success).toBe(false)
  })

  it("computes WCAG luminance and contrast", () => {
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 10)
    expect(relativeLuminance("#000000")).toBe(0)
    expect(brandContrast("#000000")).toEqual({
      onWhite: 21,
      onBlack: 1,
      meetsAaOnWhite: true,
      meetsAaOnBlack: false,
    })
    // #767676 is the classic lightest grey that still passes AA on white (4.54:1).
    expect(brandContrast("#767676")).toMatchObject({ onWhite: 4.54, meetsAaOnWhite: true })
    expect(brandContrast("#FFFF00")).toMatchObject({ meetsAaOnWhite: false, meetsAaOnBlack: true })
  })
})

describe("logo validation", () => {
  it("accepts PNG, JPEG and WebP and reads their dimensions", () => {
    expect(validateLogo(png(200, 100))).toMatchObject({
      contentType: "image/png",
      width: 200,
      height: 100,
    })
    expect(validateLogo(jpeg(320, 64))).toMatchObject({
      contentType: "image/jpeg",
      width: 320,
      height: 64,
    })
    expect(validateLogo(webp(512, 512))).toMatchObject({
      contentType: "image/webp",
      width: 512,
      height: 512,
    })
    expect(validateLogo(png(16, 16)).sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it("rejects SVG, even disguised, and other files", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>x()</script></svg>')
    expect(status(() => validateLogo(svg))).toBe(415)
    expect(status(() => validateLogo(Buffer.from('<?xml version="1.0"?><svg/>')))).toBe(415)
    expect(status(() => validateLogo(Buffer.from("GIF89a......")))).toBe(415)
  })

  it("rejects empty, oversized and truncated files", () => {
    expect(status(() => validateLogo(Buffer.alloc(0)))).toBe(400)
    expect(status(() => validateLogo(png(100, 100, LOGO_MAX_BYTES + 1)))).toBe(413)
    expect(status(() => validateLogo(png(100, 100, LOGO_MAX_BYTES)))).toBe("ok")
    expect(status(() => validateLogo(png(100, 100).subarray(0, 12)))).toBe(422)
  })

  it("rejects too small or too large dimensions", () => {
    expect(status(() => validateLogo(png(15, 100)))).toBe(422)
    expect(status(() => validateLogo(png(100, 2049)))).toBe(422)
    expect(status(() => validateLogo(png(2048, 2048)))).toBe("ok")
  })
})

describe("last owner rule", () => {
  const one = [
    { id: "o1", role: "owner" },
    { id: "a1", role: "accountant" },
  ]
  const two = [...one, { id: "o2", role: "owner" }]

  it("blocks removing or demoting the only owner", () => {
    expect(leavesNoOwner(one, "o1", { kind: "remove" })).toBe(true)
    expect(leavesNoOwner(one, "o1", { kind: "role", to: "accountant" })).toBe(true)
  })

  it("allows it when another owner remains, and any change to an accountant", () => {
    expect(leavesNoOwner(two, "o1", { kind: "remove" })).toBe(false)
    expect(leavesNoOwner(two, "o1", { kind: "role", to: "accountant" })).toBe(false)
    expect(leavesNoOwner(one, "a1", { kind: "remove" })).toBe(false)
    expect(leavesNoOwner(one, "o1", { kind: "role", to: "owner" })).toBe(false)
  })
})

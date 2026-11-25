import { describe, expect, it } from "vitest"
import {
  brandContrast,
  formatRatio,
  inviteSchema,
  isHexColor,
  logoDimensionProblem,
  logoFileProblem,
  normalizeHex,
  officeErrorKey,
  profileSchema,
} from "../../app/utils/office"

const t = (key: string) => key
const fail = (status: number, data?: unknown) =>
  Object.assign(new Error("failed"), { response: { status }, data })

describe("brand colour", () => {
  it.each(["#6d4aff", "#6D4AFF", " #000000 "])("accepts %s", (v) => {
    expect(isHexColor(v)).toBe(true)
  })
  it.each(["6d4aff", "#6d4af", "#6d4affaa", "#ggg000", "red", ""])("rejects %s", (v) => {
    expect(isHexColor(v)).toBe(false)
  })
  it("normalises to upper case with the hash", () => {
    expect(normalizeHex("6d4aff")).toBe("#6D4AFF")
    expect(normalizeHex("#1a2b3c")).toBe("#1A2B3C")
    expect(normalizeHex("#12")).toBeNull()
  })
  it("computes the same contrast as the API (WCAG 2.x)", () => {
    expect(brandContrast("#FFFFFF")).toEqual({
      onWhite: 1,
      onBlack: 21,
      meetsAaOnWhite: false,
      meetsAaOnBlack: true,
    })
    expect(brandContrast("#6D4AFF").onWhite).toBeCloseTo(5.15, 2)
    expect(brandContrast("#3AA8FF").meetsAaOnWhite).toBe(false)
  })
  it("formats ratios with a decimal comma", () => {
    expect(formatRatio(4.5)).toBe("4,50:1")
  })
})

describe("logo checks before upload", () => {
  it.each([
    [{ type: "image/svg+xml", size: 10 }, "office.brand.logoErrors.svg"],
    [{ type: "image/gif", size: 10 }, "office.brand.logoErrors.type"],
    [{ type: "image/png", size: 200 * 1024 + 1 }, "office.brand.logoErrors.size"],
    [{ type: "image/webp", size: 200 * 1024 }, null],
    [{ type: "image/jpeg", size: 1 }, null],
  ])("%o -> %s", (file, key) => {
    expect(logoFileProblem(file)).toBe(key)
  })
  it.each([
    [16, 2048, null],
    [15, 100, "office.brand.logoErrors.dimensions"],
    [100, 2049, "office.brand.logoErrors.dimensions"],
  ])("%i x %i -> %s", (width, height, key) => {
    expect(logoDimensionProblem({ width, height })).toBe(key)
  })
})

describe("office error messages", () => {
  it.each([
    [undefined, "save", "office.errors.network"],
    [429, "invite", "office.errors.rateLimited"],
    [403, "save", "office.errors.forbidden"],
    [409, "remove", "office.errors.lastOwner"],
    [409, "role", "office.errors.lastOwner"],
    [415, "logo", "office.brand.logoErrors.type"],
    [413, "logo", "office.brand.logoErrors.size"],
    [422, "logo", "office.brand.logoErrors.dimensions"],
    [404, "resend", "office.errors.invitationGone"],
    [404, "remove", "office.errors.memberGone"],
    [400, "save", "office.errors.invalid"],
    [500, "load", "office.errors.generic"],
  ] as const)("%s on %s -> %s", (status, action, key) => {
    const error = status === undefined ? new Error("offline") : fail(status)
    expect(officeErrorKey(error, action)).toBe(key)
  })
  it("explains better-auth invitation codes", () => {
    const member = fail(400, { code: "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION" })
    const invited = fail(400, { code: "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION" })
    expect(officeErrorKey(member, "invite")).toBe("office.errors.alreadyMember")
    expect(officeErrorKey(invited, "invite")).toBe("office.errors.alreadyInvited")
  })
})

describe("forms", () => {
  const profile = { name: "Escritório", cnpj: "", contactEmail: "", contactPhone: "" }
  it("accepts an empty optional profile and rejects bad values", () => {
    expect(profileSchema(t).safeParse(profile).success).toBe(true)
    expect(profileSchema(t).safeParse({ ...profile, cnpj: "11.222.333/0001-81" }).success).toBe(
      true,
    )
    for (const bad of [
      { name: " " },
      { cnpj: "11222333000182" },
      { contactEmail: "nope" },
      { contactPhone: "12" },
    ]) {
      expect(profileSchema(t).safeParse({ ...profile, ...bad }).success).toBe(false)
    }
  })
  it("invites only owners and accountants with a valid e-mail", () => {
    const schema = inviteSchema(t)
    expect(schema.safeParse({ email: "a@example.com", role: "accountant" }).success).toBe(true)
    expect(schema.safeParse({ email: "a@example.com", role: "admin" }).success).toBe(false)
    expect(schema.safeParse({ email: "x", role: "owner" }).success).toBe(false)
  })
})

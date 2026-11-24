import { describe, expect, it } from "vitest"
import {
  authErrorMessage,
  emailSchema,
  newPasswordSchema,
  officeSlug,
  passwordHint,
  safeRedirect,
  signInSchema,
  signUpSchema,
} from "../../app/utils/auth"

// Returns the key, so assertions read the message that would be shown.
const t = (key: string) => key

function problem(status: number, code?: string, headers: Record<string, string> = {}) {
  return {
    status,
    data: { status, ...(code === undefined ? {} : { code }) },
    response: { status, headers: new Headers(headers) },
  }
}

function issues(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((i) => i.message) ?? []
}

describe("form validation", () => {
  it("requires a valid e-mail and a password to sign in", () => {
    expect(issues(signInSchema(t).safeParse({ email: "", password: "" }))).toEqual([
      "auth.validation.emailRequired",
      "auth.validation.passwordRequired",
    ])
    expect(issues(signInSchema(t).safeParse({ email: "nao-e-email", password: "x" }))).toEqual([
      "auth.validation.emailInvalid",
    ])
    expect(signInSchema(t).parse({ email: " ana@example.com ", password: "x" }).email).toBe(
      "ana@example.com",
    )
  })

  it("asks for the office name only when signing up without an invitation", () => {
    const account = { name: "Ana", email: "ana@example.com", password: "0123456789" }
    expect(issues(signUpSchema(t, true).safeParse(account))).toEqual([
      "auth.validation.officeNameRequired",
    ])
    expect(signUpSchema(t, true).safeParse({ ...account, officeName: "Escritório" }).success).toBe(
      true,
    )
    expect(signUpSchema(t, false).safeParse(account).success).toBe(true)
  })

  it("keeps new passwords between 10 and 128 characters, like the API", () => {
    const schema = newPasswordSchema(t)
    expect(issues(schema.safeParse({ password: "123456789" }))).toEqual([
      "auth.validation.passwordLength",
    ])
    expect(schema.safeParse({ password: "1234567890" }).success).toBe(true)
    expect(schema.safeParse({ password: "x".repeat(128) }).success).toBe(true)
    expect(schema.safeParse({ password: "x".repeat(129) }).success).toBe(false)
  })

  it("validates the e-mail-only forms", () => {
    expect(issues(emailSchema(t).safeParse({ email: "a@" }))).toEqual([
      "auth.validation.emailInvalid",
    ])
  })
})

describe("API error messages", () => {
  it("maps better-auth codes to friendly messages", () => {
    expect(authErrorMessage(problem(401, "INVALID_EMAIL_OR_PASSWORD")).key).toBe(
      "auth.errors.invalidCredentials",
    )
    expect(authErrorMessage(problem(403, "EMAIL_NOT_VERIFIED")).key).toBe(
      "auth.errors.emailNotVerified",
    )
    expect(authErrorMessage(problem(400, "INVITATION_NOT_FOUND")).key).toBe(
      "auth.errors.invitationUnavailable",
    )
    expect(authErrorMessage(problem(403, "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION")).key).toBe(
      "auth.errors.invitationOtherEmail",
    )
    expect(authErrorMessage(problem(400, "INVALID_TOKEN")).key).toBe("auth.errors.linkInvalid")
    expect(authErrorMessage(problem(400, "RESET_PASSWORD_DISABLED")).key).toBe(
      "auth.errors.resetUnavailable",
    )
  })

  it("turns 429 into a wait time in minutes from Retry-After", () => {
    expect(authErrorMessage(problem(429, undefined, { "retry-after": "61" }))).toEqual({
      key: "auth.errors.tooManyAttempts",
      params: { minutes: 2 },
    })
    expect(authErrorMessage(problem(429))).toEqual({ key: "auth.errors.tooManyAttemptsLater" })
  })

  it("falls back to the caller's message for unknown 4xx and to a generic one for 5xx", () => {
    expect(authErrorMessage(problem(400), "auth.errors.invitationUnavailable").key).toBe(
      "auth.errors.invitationUnavailable",
    )
    expect(authErrorMessage(problem(400)).key).toBe("auth.errors.generic")
    expect(authErrorMessage(problem(503), "auth.errors.linkInvalid").key).toBe(
      "auth.errors.generic",
    )
  })

  it("reports network failures separately", () => {
    expect(authErrorMessage(new TypeError("fetch failed")).key).toBe("auth.errors.network")
  })
})

describe("passwordHint", () => {
  it("states the minimum, counts what is missing and confirms when it is reached", () => {
    expect(passwordHint(0)).toEqual({ key: "auth.fields.passwordHelp", count: 0 })
    expect(passwordHint(1)).toEqual({ key: "auth.fields.passwordMissing", count: 9 })
    expect(passwordHint(9)).toEqual({ key: "auth.fields.passwordMissing", count: 1 })
    expect(passwordHint(10)).toEqual({ key: "auth.fields.passwordOk", count: 0 })
    expect(passwordHint(40)).toEqual({ key: "auth.fields.passwordOk", count: 0 })
  })
})

describe("safeRedirect", () => {
  it("keeps same-app paths and rejects anything that leaves the app", () => {
    expect(safeRedirect("/convites/abc")).toBe("/convites/abc")
    expect(safeRedirect(undefined)).toBe("/painel")
    for (const unsafe of ["//evil.example", "/\\evil.example", "https://evil.example", "painel"]) {
      expect(safeRedirect(unsafe)).toBe("/painel")
    }
  })
})

describe("officeSlug", () => {
  it("builds a URL-safe slug with the random suffix", () => {
    expect(officeSlug("Contabilidade São João & Filhos", "a1b2c3")).toBe(
      "contabilidade-sao-joao-filhos-a1b2c3",
    )
    expect(officeSlug("!!!", "a1b2c3")).toBe("a1b2c3")
    expect(officeSlug("x".repeat(60), "s").length).toBe(42)
  })
})

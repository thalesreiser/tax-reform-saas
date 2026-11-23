import { z } from "zod"

// Plain module (no Nuxt imports), so the unit tests exercise it directly.

/** Mirrors the API (apps/api/src/auth/auth.ts). */
export const PASSWORD_MIN_LENGTH = 10
export const PASSWORD_MAX_LENGTH = 128
const NAME_MAX_LENGTH = 100

/** Key of the localStorage entry holding the office name typed at sign-up until it is created. */
export const PENDING_OFFICE_KEY = "trs:pending-office"

export type Translate = (key: string, named?: Record<string, unknown>) => string

export interface AuthMessage {
  key: string
  params?: { minutes: number }
}

export interface Session {
  user: { id: string; email: string; name: string; emailVerified: boolean }
  session: { activeOrganizationId?: string | null }
}

export interface Office {
  id: string
  name: string
  role: "owner" | "accountant"
}

export interface Invitation {
  id: string
  email: string
  role: string
  organizationName: string
}

function email(t: Translate) {
  return z
    .string()
    .trim()
    .min(1, t("auth.validation.emailRequired"))
    .pipe(z.email(t("auth.validation.emailInvalid")))
}

function newPassword(t: Translate) {
  const named = { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }
  return z
    .string()
    .min(PASSWORD_MIN_LENGTH, t("auth.validation.passwordLength", named))
    .max(PASSWORD_MAX_LENGTH, t("auth.validation.passwordLength", named))
}

function name(t: Translate, key: string) {
  return z
    .string({ error: t(key) })
    .trim()
    .min(1, t(key))
    .max(NAME_MAX_LENGTH, t("auth.validation.tooLong"))
}

export const signInSchema = (t: Translate) =>
  z.object({ email: email(t), password: z.string().min(1, t("auth.validation.passwordRequired")) })

/** Sign-up; an invitee joins an existing office, so the office name is only asked otherwise. */
export const signUpSchema = (t: Translate, withOffice: boolean) => {
  const account = z.object({
    name: name(t, "auth.validation.nameRequired"),
    email: email(t),
    password: newPassword(t),
  })
  return withOffice
    ? account.extend({ officeName: name(t, "auth.validation.officeNameRequired") })
    : account.extend({ officeName: z.string().optional() })
}

export const emailSchema = (t: Translate) => z.object({ email: email(t) })

export const officeSchema = (t: Translate) =>
  z.object({ officeName: name(t, "auth.validation.officeNameRequired") })

export const newPasswordSchema = (t: Translate) => z.object({ password: newPassword(t) })

export type SignInInput = z.output<ReturnType<typeof signInSchema>>
export type SignUpInput = z.output<ReturnType<typeof signUpSchema>>
export type EmailInput = z.output<ReturnType<typeof emailSchema>>
export type OfficeInput = z.output<ReturnType<typeof officeSchema>>
export type NewPasswordInput = z.output<ReturnType<typeof newPasswordSchema>>

function field(source: unknown, key: string): unknown {
  return typeof source === "object" && source !== null && key in source
    ? (source as Record<string, unknown>)[key]
    : undefined
}

/** HTTP status of a failed `$fetch` call; undefined for network errors. */
export function errorStatus(error: unknown): number | undefined {
  const status = field(error, "status") ?? field(field(error, "response"), "status")
  return typeof status === "number" ? status : undefined
}

function retryAfterMinutes(error: unknown): number | undefined {
  const headers = field(field(error, "response"), "headers")
  const value = headers instanceof Headers ? headers.get("retry-after") : null
  const seconds = value === null ? Number.NaN : Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds / 60) : undefined
}

/** better-auth `code` (problem details) -> message key. */
const CODE_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "auth.errors.invalidCredentials",
  EMAIL_NOT_VERIFIED: "auth.errors.emailNotVerified",
  EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION: "auth.errors.emailNotVerified",
  INVITATION_NOT_FOUND: "auth.errors.invitationUnavailable",
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "auth.errors.invitationOtherEmail",
  INVALID_TOKEN: "auth.errors.linkInvalid",
  TOKEN_EXPIRED: "auth.errors.linkInvalid",
  RESET_PASSWORD_DISABLED: "auth.errors.resetUnavailable",
  PASSWORD_TOO_SHORT: "auth.errors.passwordLength",
  PASSWORD_TOO_LONG: "auth.errors.passwordLength",
  ORGANIZATION_ALREADY_EXISTS: "auth.errors.officeTaken",
}

/**
 * Friendly message for a failed auth call. Never says whether an e-mail has an account: the API
 * answers the same for both, and unknown codes fall back to `fallback`.
 */
export function authErrorMessage(error: unknown, fallback = "auth.errors.generic"): AuthMessage {
  const status = errorStatus(error)
  if (status === undefined) return { key: "auth.errors.network" }
  if (status === 429) {
    const minutes = retryAfterMinutes(error)
    return minutes === undefined
      ? { key: "auth.errors.tooManyAttemptsLater" }
      : { key: "auth.errors.tooManyAttempts", params: { minutes } }
  }
  const code = field(field(error, "data"), "code")
  const known = typeof code === "string" ? CODE_MESSAGES[code] : undefined
  if (known !== undefined) return { key: known }
  return { key: status >= 500 ? "auth.errors.generic" : fallback }
}

/** Only same-app paths: `//host` or absolute URLs would turn sign-in into an open redirect. */
export function safeRedirect(value: unknown, fallback = "/painel"): string {
  return typeof value === "string" && /^\/(?![/\\])/.test(value) ? value : fallback
}

/** URL-safe office slug; the random suffix keeps two offices with the same name apart. */
export function officeSlug(officeName: string, suffix: string): string {
  const base = officeName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "")
  return base === "" ? suffix : `${base}-${suffix}`
}

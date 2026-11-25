import { z } from "zod"
import { errorStatus, type Translate } from "./auth"
import { isValidCnpj, normalizeCnpj } from "./cnpj"

// Office settings, brand and team (FE-02.4, RF-01): API shapes (apps/api/src/routes/office-settings.ts
// and members.ts), form schemas, client-side logo checks and error messages. Plain module, so the
// unit tests exercise it directly.

export type OfficeRole = "owner" | "accountant"
export const OFFICE_ROLES: readonly OfficeRole[] = ["owner", "accountant"]

export interface BrandContrast {
  onWhite: number
  onBlack: number
  meetsAaOnWhite: boolean
  meetsAaOnBlack: boolean
}

export interface OfficeSettings {
  id: string
  name: string
  role: OfficeRole
  cnpj: string | null
  contactEmail: string | null
  contactPhone: string | null
  brandColor: string | null
  brandContrast: BrandContrast | null
  logo: {
    url: string
    contentType: string
    width: number
    height: number
    etag: string
    updatedAt: string
  } | null
  updatedAt: string
}

export interface Member {
  id: string
  userId: string
  name: string
  email: string
  role: OfficeRole
  joinedAt: string
}

export interface PendingInvitation {
  id: string
  email: string
  role: OfficeRole
  expiresAt: string
  createdAt: string
}

// Brand colour: same rules and formula as apps/api/src/office/brand-color.ts, so the preview warns
// while typing; after a save the API's `brandContrast` is shown.
const HEX = /^#[0-9a-fA-F]{6}$/
export const AA_CONTRAST = 4.5

export function isHexColor(value: string): boolean {
  return HEX.test(value.trim())
}

/** `1a2b3c` or `#1a2b3c` -> `#1A2B3C`; `null` when it is not a 6-digit hex colour. */
export function normalizeHex(value: string): string | null {
  const v = value.trim()
  const hex = v.startsWith("#") ? v : `#${v}`
  return HEX.test(hex) ? hex.toUpperCase() : null
}

function channel(hex: string, offset: number): number {
  const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function ratio(a: number, b: number): number {
  const [light, dark] = a >= b ? [a, b] : [b, a]
  return (light + 0.05) / (dark + 0.05)
}

const round2 = (value: number) => Math.round(value * 100) / 100

/** WCAG contrast of a `#RRGGBB` colour against white and black (display ratios only). */
export function brandContrast(hex: string): BrandContrast {
  const l = 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5)
  const onWhite = ratio(l, 1)
  const onBlack = ratio(l, 0)
  return {
    onWhite: round2(onWhite),
    onBlack: round2(onBlack),
    meetsAaOnWhite: onWhite >= AA_CONTRAST,
    meetsAaOnBlack: onBlack >= AA_CONTRAST,
  }
}

/** "4.5" -> "4,50:1". */
export function formatRatio(value: number): string {
  return `${value.toFixed(2).replace(".", ",")}:1`
}

// Logo: the API detects the type from the bytes; these checks only avoid a pointless upload.
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const
export const LOGO_MAX_BYTES = 200 * 1024
export const LOGO_MIN_SIDE = 16
export const LOGO_MAX_SIDE = 2048

/** Message key when the file cannot be a valid logo by its declared type or size; else null. */
export function logoFileProblem(file: { type: string; size: number }): string | null {
  if (file.type === "image/svg+xml") return "office.brand.logoErrors.svg"
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return "office.brand.logoErrors.type"
  if (file.size > LOGO_MAX_BYTES) return "office.brand.logoErrors.size"
  return null
}

/** Message key when the decoded image is outside 16-2048 px per side; else null. */
export function logoDimensionProblem(size: { width: number; height: number }): string | null {
  const fits = (side: number) => side >= LOGO_MIN_SIDE && side <= LOGO_MAX_SIDE
  return fits(size.width) && fits(size.height) ? null : "office.brand.logoErrors.dimensions"
}

export type OfficeAction =
  "load" | "save" | "logo" | "removeLogo" | "role" | "remove" | "invite" | "cancelInvite" | "resend"

function code(error: unknown): unknown {
  const data =
    typeof error === "object" && error !== null && "data" in error ? error.data : undefined
  return typeof data === "object" && data !== null && "code" in data ? data.code : undefined
}

/** Message key for a failed office, member or invitation call (problem details from the API). */
export function officeErrorKey(error: unknown, action: OfficeAction): string {
  const status = errorStatus(error)
  if (status === undefined) return "office.errors.network"
  if (status === 429) return "office.errors.rateLimited"
  if (status === 403) return "office.errors.forbidden"
  if (status === 409 && (action === "role" || action === "remove")) return "office.errors.lastOwner"
  if (action === "logo") {
    if (status === 415) return "office.brand.logoErrors.type"
    if (status === 413) return "office.brand.logoErrors.size"
    if (status === 422) return "office.brand.logoErrors.dimensions"
  }
  if (action === "invite") {
    const c = code(error)
    if (c === "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION") return "office.errors.alreadyMember"
    if (c === "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION") return "office.errors.alreadyInvited"
  }
  if (status === 404) {
    if (action === "cancelInvite" || action === "resend") return "office.errors.invitationGone"
    if (action === "role" || action === "remove") return "office.errors.memberGone"
  }
  if (status === 400 && (action === "save" || action === "invite")) return "office.errors.invalid"
  return "office.errors.generic"
}

const PHONE = /^\+?[0-9 ().-]{8,20}$/

export const profileSchema = (t: Translate) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(1, t("office.validation.nameRequired"))
      .max(200, t("office.validation.tooLong", { max: 200 })),
    cnpj: z
      .string()
      .refine(
        (v) => v.trim() === "" || isValidCnpj(normalizeCnpj(v)),
        t("office.validation.cnpjInvalid"),
      ),
    contactEmail: z
      .string()
      .trim()
      .max(254, t("office.validation.tooLong", { max: 254 }))
      .refine((v) => v === "" || z.email().safeParse(v).success, t("office.validation.email")),
    contactPhone: z
      .string()
      .trim()
      .refine((v) => v === "" || PHONE.test(v), t("office.validation.phone")),
  })

export type ProfileInput = z.output<ReturnType<typeof profileSchema>>

export const inviteSchema = (t: Translate) =>
  z.object({
    email: z
      .string()
      .trim()
      .min(1, t("office.validation.emailRequired"))
      .pipe(z.email(t("office.validation.email"))),
    role: z.enum(["owner", "accountant"]),
  })

export type InviteInput = z.output<ReturnType<typeof inviteSchema>>

/** "24/11/2026" in Brasília time. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso))
}

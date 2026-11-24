import { z } from "zod"

/** WCAG 2.x AA minimum contrast for normal text. */
export const AA_CONTRAST = 4.5

/** `#RRGGBB` or `#rrggbb`; stored upper-case (also the database CHECK). */
export const brandColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #1A2B3C")
  .overwrite((value) => value.toUpperCase())

function channel(hex: string, offset: number): number {
  const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/** Relative luminance of a `#RRGGBB` colour (WCAG 2.x definition). */
export function relativeLuminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5)
}

/** Contrast ratio between two luminances, 1 to 21. */
export function contrastRatio(a: number, b: number): number {
  const [light, dark] = a >= b ? [a, b] : [b, a]
  return (light + 0.05) / (dark + 0.05)
}

export const brandContrastSchema = z.object({
  onWhite: z.number().describe("Contrast ratio of the colour against white"),
  onBlack: z.number().describe("Contrast ratio of the colour against black"),
  meetsAaOnWhite: z.boolean(),
  meetsAaOnBlack: z.boolean(),
})

const round2 = (value: number) => Math.round(value * 100) / 100

/**
 * Contrast of the brand colour against white and black, so the web app can warn when text in that
 * colour (or on it) would be hard to read. Display ratios only: never money or rates.
 */
export function brandContrast(hex: string): z.output<typeof brandContrastSchema> {
  const luminance = relativeLuminance(hex)
  const onWhite = contrastRatio(luminance, 1)
  const onBlack = contrastRatio(luminance, 0)
  return {
    onWhite: round2(onWhite),
    onBlack: round2(onBlack),
    meetsAaOnWhite: onWhite >= AA_CONTRAST,
    meetsAaOnBlack: onBlack >= AA_CONTRAST,
  }
}

// WCAG 2.1 AA contrast of the Aurora tokens (ADR 006, RNF-07). The values are read from the shipped
// CSS, so a token change that breaks contrast fails here.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { auroraColors, type SemanticColor } from "../../app/theme/aurora"

type Rgb = readonly [number, number, number]
type Rgba = { rgb: Rgb; alpha: number }
type Mode = "light" | "dark"

const css = readFileSync(
  fileURLToPath(new URL("../../app/assets/css/main.css", import.meta.url)),
  "utf8",
)

function block(selector: string): string {
  const start = css.indexOf(`\n${selector} {\n`)
  if (start === -1) throw new Error(`missing ${selector} block`)
  return css.slice(start, css.indexOf("\n}\n", start))
}

function declarations(source: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const [, name, value] of source.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    if (name && value) map.set(name, value.trim())
  }
  return map
}

const palette = declarations(block("@theme static"))
const tokens: Record<Mode, Map<string, string>> = {
  light: declarations(block(":root")),
  dark: new Map([...declarations(block(":root")), ...declarations(block(".dark"))]),
}

function parse(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex?.[1]) {
    const n = Number.parseInt(hex[1], 16)
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 }
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/.exec(value)
  if (rgb) {
    return { rgb: [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])], alpha: Number(rgb[4] ?? 1) }
  }
  throw new Error(`unsupported colour value: ${value}`)
}

/** Resolves a token (`--ui-text`, `--aurora-glass`, ...) or a literal to a colour. */
function color(token: string, mode: Mode): Rgba {
  const value = token.startsWith("--") ? tokens[mode].get(token) : token
  if (!value) throw new Error(`missing token ${token}`)
  const shade = /^var\(--ui-color-(\w+)-(\d+)\)$/.exec(value)
  if (shade?.[1] && shade[2]) {
    const name = auroraColors[shade[1] as SemanticColor]
    return color(
      palette.get(`--color-${name}-${shade[2]}`) ?? `missing ${shade[1]}-${shade[2]}`,
      mode,
    )
  }
  const ref = /^var\((--[\w-]+)\)$/.exec(value)
  if (ref?.[1]) return color(ref[1], mode)
  return parse(value)
}

function over(top: Rgba, bottom: Rgb): Rgb {
  return top.rgb.map((c, i) => c * top.alpha + (bottom[i] ?? 0) * (1 - top.alpha)) as unknown as Rgb
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

function opaque(token: string, mode: Mode): Rgb {
  const c = color(token, mode)
  if (c.alpha !== 1) throw new Error(`${token} is translucent`)
  return c.rgb
}

/** Samples a linear gradient between opaque stops. */
function gradient(stops: string[], mode: Mode, steps = 20): Rgb[] {
  const colors = stops.map((s) => opaque(s, mode))
  const samples: Rgb[] = []
  for (let i = 0; i < colors.length - 1; i++) {
    const [from, to] = [colors[i], colors[i + 1]] as [Rgb, Rgb]
    for (let s = 0; s <= steps; s++) {
      samples.push(from.map((c, k) => c + ((to[k] ?? 0) - c) * (s / steps)) as unknown as Rgb)
    }
  }
  return samples
}

/** Every surface text can sit on: the page, a glass card, its opaque fallback and the header. */
function surfaces(mode: Mode): Rgb[] {
  const page = gradient(["--aurora-page-from", "--aurora-page-via", "--aurora-page-to"], mode)
  const bg = color("--ui-bg", mode)
  return [
    ...page,
    ...page.map((p) => over(color("--aurora-glass", mode), p)),
    // UHeader: `bg-default/75` over the page.
    ...page.map((p) => over({ rgb: bg.rgb, alpha: 0.75 }, p)),
    opaque("--aurora-glass-opaque", mode),
    bg.rgb,
  ]
}

function worst(text: Rgb, backgrounds: Rgb[]): number {
  return Math.min(...backgrounds.map((b) => contrast(text, b)))
}

const TEXT = 4.5
const textTokens = [
  "--ui-text",
  "--ui-text-highlighted",
  "--ui-text-muted",
  "--ui-primary",
  "--ui-secondary",
  "--ui-success",
  "--ui-info",
  "--ui-warning",
  "--ui-error",
]
type Solid = Exclude<SemanticColor, "neutral">
const solidColors: Solid[] = ["primary", "secondary", "success", "info", "warning", "error"]
// Hover and active shades set in app.config.ts (button compound variants).
const hoverShade: Record<Mode, Record<Solid, number>> = {
  light: { primary: 600, secondary: 800, success: 800, info: 800, warning: 800, error: 800 },
  dark: { primary: 300, secondary: 300, success: 300, info: 300, warning: 300, error: 300 },
}

describe("WCAG contrast helper", () => {
  it("matches known reference ratios", () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5)
    expect(contrast([255, 255, 255], [0x3a, 0xa8, 0xff])).toBeCloseTo(2.55, 2)
    expect(contrast([255, 255, 255], [0x6d, 0x4a, 0xff])).toBeCloseTo(5.15, 2)
  })
})

describe.each<Mode>(["light", "dark"])("Aurora tokens, %s mode", (mode) => {
  it.each(textTokens)("%s reaches 4.5:1 on every surface", (token) => {
    expect(worst(opaque(token, mode), surfaces(mode))).toBeGreaterThanOrEqual(TEXT)
  })

  it.each(solidColors)("inverted text reaches 4.5:1 on solid %s, including hover", (name) => {
    const text = opaque("--ui-text-inverted", mode)
    const shade = hoverShade[mode][name]
    expect(contrast(text, opaque(`--ui-${name}`, mode))).toBeGreaterThanOrEqual(TEXT)
    expect(contrast(text, opaque(`var(--ui-color-${name}-${shade})`, mode))).toBeGreaterThanOrEqual(
      TEXT,
    )
  })

  it.each([
    ["gain", "--aurora-gain-text", "--aurora-gain-bg"],
    ["increase", "--aurora-increase-text", "--aurora-increase-bg"],
  ])("%s pill text reaches 4.5:1 on its tint over a glass card", (_, text, tint) => {
    const cards = surfaces(mode)
    const pills = cards.map((card) => over(color(tint, mode), card))
    expect(worst(opaque(text, mode), pills)).toBeGreaterThanOrEqual(TEXT)
  })

  // UAlert subtle (auth screens): `text-<color>` on `bg-<color>/10`; descriptions at full opacity.
  it.each(["error", "success", "info", "warning"])(
    "%s alert text reaches 4.5:1 on its 10%% tint over every surface",
    (name) => {
      const text = color(`--ui-${name}`, mode)
      const alerts = surfaces(mode).map((s) => over({ rgb: text.rgb, alpha: 0.1 }, s))
      expect(worst(opaque(`--ui-${name}`, mode), alerts)).toBeGreaterThanOrEqual(TEXT)
    },
  )

  it("white text reaches 4.5:1 along the whole strong brand gradient", () => {
    const strong = gradient(["--aurora-brand-from", "--aurora-brand-strong-to"], mode)
    expect(worst(opaque("--aurora-on-brand", mode), strong)).toBeGreaterThanOrEqual(TEXT)
  })

  it("the focus ring (primary) reaches 3:1 against every surface", () => {
    expect(worst(opaque("--ui-primary", mode), surfaces(mode))).toBeGreaterThanOrEqual(3)
  })

  // FE-UX-01 pairs: auth brand panel, header actions, password field and dashboard tiles.
  it("brand panel and lead KPI tile: white text and chart bars on `surface-brand`", () => {
    const panel = gradient(["--aurora-brand-from", "--aurora-brand-strong-to"], mode)
    expect(worst(opaque("--aurora-on-brand", mode), panel)).toBeGreaterThanOrEqual(TEXT)
  })

  it.each(["--ui-text-highlighted", "--ui-text-muted"])(
    "%s (KPI tile labels and values) reaches 4.5:1 on a glass tile",
    (token) => {
      const page = gradient(["--aurora-page-from", "--aurora-page-via", "--aurora-page-to"], mode)
      const tiles = [
        ...page.map((p) => over(color("--aurora-glass", mode), p)),
        opaque("--aurora-glass-opaque", mode),
      ]
      expect(worst(opaque(token, mode), tiles)).toBeGreaterThanOrEqual(TEXT)
    },
  )

  it("header ghost actions, the account menu and the 'Em breve' badge on the elevated grey", () => {
    // Nuxt UI: neutral ghost buttons hover to `bg-elevated`; the neutral subtle badge sits on it.
    const elevated =
      mode === "light" ? "var(--ui-color-neutral-100)" : "var(--ui-color-neutral-800)"
    expect(contrast(opaque("--ui-text", mode), opaque(elevated, mode))).toBeGreaterThanOrEqual(TEXT)
  })

  it("outline primary button text reaches 4.5:1 at rest and on its 10% hover tint", () => {
    // Hover text shade set in app.config.ts (the resting violet drops to 3.99:1 on the tint).
    const primary = color("--ui-primary", mode)
    const hoverText = opaque(`var(--ui-color-primary-${hoverShade[mode].primary})`, mode)
    const hovered = surfaces(mode).map((s) => over({ rgb: primary.rgb, alpha: 0.1 }, s))
    expect(worst(primary.rgb, surfaces(mode))).toBeGreaterThanOrEqual(TEXT)
    expect(worst(hoverText, hovered)).toBeGreaterThanOrEqual(TEXT)
  })

  // FE-02.1 pairs: app shell navigation and dashboard home.
  it("active navigation item: highlighted text on the 10% primary tint", () => {
    const primary = color("--ui-primary", mode)
    const active = surfaces(mode).map((s) => over({ rgb: primary.rgb, alpha: 0.1 }, s))
    expect(worst(opaque("--ui-text-highlighted", mode), active)).toBeGreaterThanOrEqual(TEXT)
  })

  it("disabled navigation items and table headers (muted) reach 4.5:1 on every surface", () => {
    expect(worst(opaque("--ui-text-muted", mode), surfaces(mode))).toBeGreaterThanOrEqual(TEXT)
  })

  it("next onboarding step: white text and its white outline on `surface-brand`", () => {
    const panel = gradient(["--aurora-brand-from", "--aurora-brand-strong-to"], mode)
    const white = opaque("--aurora-on-brand", mode)
    expect(worst(white, panel)).toBeGreaterThanOrEqual(TEXT)
    // "Próximo passo" chip border: white at 70% over the panel, a UI graphic (3:1).
    const border = panel.map((p) => over({ rgb: white, alpha: 0.7 }, p))
    expect(Math.min(...border.map((b, i) => contrast(b, panel[i] as Rgb)))).toBeGreaterThanOrEqual(
      3,
    )
  })

  it("done onboarding step: inverted check on the solid success circle", () => {
    expect(
      contrast(opaque("--ui-text-inverted", mode), opaque("--ui-success", mode)),
    ).toBeGreaterThanOrEqual(3)
  })

  it("the password toggle icon (muted) reaches 3:1 on the input background", () => {
    const input = opaque("--ui-bg", mode)
    expect(contrast(opaque("--ui-text-muted", mode), input)).toBeGreaterThanOrEqual(3)
  })
})

describe("documented adjustments", () => {
  it("keeps the decorative brand gradient end below text contrast, so it must not carry text", () => {
    const white = opaque("--aurora-on-brand", "light")
    expect(contrast(white, opaque("--aurora-brand-to", "light"))).toBeLessThan(TEXT)
  })
})

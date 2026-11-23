// Aurora visual direction (ADR 006): Nuxt UI semantic colour -> palette name. Every palette is
// defined as `--color-<name>-<shade>` in `app/assets/css/main.css` (`@theme static`).
// Plain module so `app.config.ts` and the contrast test share it.
export const auroraColors = {
  primary: "iris",
  secondary: "azure",
  success: "mint",
  info: "azure",
  warning: "ember",
  error: "ruby",
  neutral: "dusk",
} as const

export type SemanticColor = keyof typeof auroraColors

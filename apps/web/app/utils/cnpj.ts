// CNPJ checks for the client form (RF-02). A copy of apps/api/src/clients/cnpj.ts without zod, kept
// in sync by the same test vectors (test/unit/cnpj.test.ts): numeric and alphanumeric CNPJs (from
// July 2026: 12 characters 0-9A-Z and 2 numeric check digits, modulo 11 over ASCII - 48; Receita
// Federal, Nota Técnica Conjunta COCAD/SUARA/RFB nº 49/2024). Plain module for the unit tests.

const WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const WEIGHTS_2 = [6, ...WEIGHTS_1]
const CNPJ_PATTERN = /^[0-9A-Z]{12}[0-9]{2}$/
export const CNPJ_LENGTH = 14

/** Removes the mask (`.`, `/`, `-` and spaces) and uppercases. */
export function normalizeCnpj(input: string): string {
  return input.replace(/[\s./-]/g, "").toUpperCase()
}

function digit(chars: string, weights: number[]): number {
  let sum = 0
  for (let i = 0; i < weights.length; i += 1) {
    sum += (chars.charCodeAt(i) - 48) * (weights[i] ?? 0)
  }
  const rest = sum % 11
  return rest < 2 ? 0 : 11 - rest
}

export function cnpjCheckDigits(base: string): string {
  if (!/^[0-9A-Z]{12}$/.test(base)) throw new RangeError("A CNPJ base has 12 characters 0-9A-Z.")
  const first = digit(base, WEIGHTS_1)
  const second = digit(`${base}${String(first)}`, WEIGHTS_2)
  return `${String(first)}${String(second)}`
}

/** True for a normalised CNPJ with valid check digits; repeated characters are rejected. */
export function isValidCnpj(cnpj: string): boolean {
  if (!CNPJ_PATTERN.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) return false
  return cnpjCheckDigits(cnpj.slice(0, 12)) === cnpj.slice(12)
}

/**
 * Mask applied while typing: `12abc345` -> `12.ABC.345`, full -> `12.ABC.345/01DE-35`. Characters
 * other than 0-9A-Z are dropped and the input is cut at 14 characters.
 */
export function formatCnpj(input: string): string {
  const raw = normalizeCnpj(input)
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, CNPJ_LENGTH)
  const parts: [number, string][] = [
    [2, ""],
    [5, "."],
    [8, "."],
    [12, "/"],
    [14, "-"],
  ]
  let out = ""
  let start = 0
  for (const [end, sep] of parts) {
    if (raw.length <= start) break
    out += sep + raw.slice(start, end)
    start = end
  }
  return out
}

export type CnpjInputState = "empty" | "incomplete" | "invalid" | "valid"

/** State of the CNPJ field as typed (masked or not). */
export function cnpjInputState(input: string): CnpjInputState {
  const cnpj = normalizeCnpj(input)
  if (cnpj === "") return "empty"
  if (/[^0-9A-Z]/.test(cnpj)) return "invalid"
  if (cnpj.length < CNPJ_LENGTH) return "incomplete"
  return isValidCnpj(cnpj) ? "valid" : "invalid"
}

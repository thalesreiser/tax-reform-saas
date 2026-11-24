import { z } from "zod"

/**
 * CNPJ validation (RF-02), numeric and alphanumeric.
 *
 * From July 2026 the Receita Federal also issues alphanumeric CNPJs: 12 characters of `0-9A-Z`
 * (8 of root, 4 of order) followed by 2 numeric check digits. The check digits use the classic
 * modulo-11 algorithm with each character valued as its ASCII code minus 48 (`0`-`9` stay 0-9,
 * `A` = 17 ... `Z` = 42), so numeric CNPJs validate exactly as before. Source: Receita Federal,
 * "CNPJ Alfanumérico", Nota Técnica Conjunta COCAD/SUARA/RFB nº 49/2024 and the Serpro calculation
 * guide (https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/cnpj-alfanumerico),
 * whose worked example is 12.ABC.345/01DE-35.
 */

/** Stored form: 12 alphanumeric characters and 2 check digits (also the database CHECK). */
export const CNPJ_PATTERN = /^[0-9A-Z]{12}[0-9]{2}$/

const WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const WEIGHTS_2 = [6, ...WEIGHTS_1]

/** Removes the mask (`.`, `/`, `-` and spaces) and uppercases: `12.abc.345/01de-35` -> `12ABC34501DE35`. */
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

/** The two check digits of a 12-character base (`0-9A-Z`). */
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

/** Request field: accepts the masked or plain form and yields the normalised CNPJ. */
export const cnpjSchema = z
  .string()
  .max(20)
  .overwrite(normalizeCnpj)
  .refine(isValidCnpj, "Invalid CNPJ")
  .describe("CNPJ, numeric or alphanumeric, with or without the mask")

/**
 * Years of the consumption-tax transition (EC 132/2023, LC 214/2025): CBS and IBS start as test
 * rates in 2026, and ICMS and ISS are fully replaced by IBS in 2033.
 */
export const TRANSITION_YEARS = [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033] as const

export type TransitionYear = (typeof TRANSITION_YEARS)[number]

export const FIRST_TRANSITION_YEAR: TransitionYear = TRANSITION_YEARS[0]
export const LAST_TRANSITION_YEAR: TransitionYear = TRANSITION_YEARS[7]

export function isTransitionYear(year: number): year is TransitionYear {
  return (TRANSITION_YEARS as readonly number[]).includes(year)
}

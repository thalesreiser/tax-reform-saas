declare const decimalText: unique symbol

/**
 * A decimal as the engines send it: BigDecimal serialised as a JSON string ("42.24"). Their OpenAPI
 * documents declare these fields as `number`; the generated types use this brand instead, and the
 * client turns every one of them into a decimal (`Decimalized`), so callers never see the text.
 */
export type DecimalText = string & { readonly [decimalText]: true }

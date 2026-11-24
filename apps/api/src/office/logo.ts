import { createHash } from "node:crypto"
import { LOGO_MAX_BYTES } from "../db/schema.js"

export { LOGO_MAX_BYTES }

/** Accepted logo types. SVG is never accepted: it can carry scripts (XSS). */
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const
export type LogoType = (typeof LOGO_TYPES)[number]
export const LOGO_MIN_SIDE = 16
export const LOGO_MAX_SIDE = 2048

export interface ValidLogo {
  contentType: LogoType
  width: number
  height: number
  sha256: string
}

export class LogoError extends Error {
  readonly statusCode: number
  constructor(message: string, statusCode = 422) {
    super(message)
    this.statusCode = statusCode
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function pngSize(data: Buffer): [number, number] | undefined {
  // Signature, then the IHDR chunk: length (4), "IHDR", width (4), height (4).
  if (data.length < 24 || data.toString("latin1", 12, 16) !== "IHDR") return undefined
  return [data.readUInt32BE(16), data.readUInt32BE(20)]
}

/** Start-of-frame markers that carry the dimensions (baseline, progressive, ...). */
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

function jpegSize(data: Buffer): [number, number] | undefined {
  let offset = 2
  while (offset + 9 <= data.length) {
    if (data[offset] !== 0xff) return undefined
    const marker = data[offset + 1] ?? 0
    if (marker === 0xff) {
      offset += 1
      continue
    }
    const length = data.readUInt16BE(offset + 2)
    if (SOF.has(marker)) return [data.readUInt16BE(offset + 7), data.readUInt16BE(offset + 5)]
    if (length < 2) return undefined
    offset += 2 + length
  }
  return undefined
}

function webpSize(data: Buffer): [number, number] | undefined {
  if (data.length < 30) return undefined
  const chunk = data.toString("latin1", 12, 16)
  if (chunk === "VP8 ") {
    if (data[23] !== 0x9d || data[24] !== 0x01 || data[25] !== 0x2a) return undefined
    return [data.readUInt16LE(26) & 0x3fff, data.readUInt16LE(28) & 0x3fff]
  }
  if (chunk === "VP8L") {
    if (data[20] !== 0x2f) return undefined
    const bits = data.readUInt32LE(21)
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1]
  }
  if (chunk === "VP8X") {
    return [data.readUIntLE(24, 3) + 1, data.readUIntLE(27, 3) + 1]
  }
  return undefined
}

/** The type and dimensions from the file's own bytes; the declared content type is not trusted. */
function sniff(data: Buffer): { contentType: LogoType; size: [number, number] | undefined } | null {
  if (data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { contentType: "image/png", size: pngSize(data) }
  }
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return { contentType: "image/jpeg", size: jpegSize(data) }
  }
  if (data.toString("latin1", 0, 4) === "RIFF" && data.toString("latin1", 8, 12) === "WEBP") {
    return { contentType: "image/webp", size: webpSize(data) }
  }
  return null
}

/**
 * Validates an uploaded logo: PNG, JPEG or WebP by its magic bytes (anything else, SVG included,
 * is rejected), at most LOGO_MAX_BYTES, sides between LOGO_MIN_SIDE and LOGO_MAX_SIDE pixels.
 */
export function validateLogo(data: Buffer): ValidLogo {
  if (data.length === 0) throw new LogoError("The logo is empty.", 400)
  if (data.length > LOGO_MAX_BYTES) {
    throw new LogoError(`The logo must be at most ${String(LOGO_MAX_BYTES / 1024)} KB.`, 413)
  }
  const found = sniff(data)
  if (found === null) throw new LogoError("The logo must be a PNG, JPEG or WebP image.", 415)
  if (found.size === undefined) throw new LogoError("The image could not be read.")
  const [width, height] = found.size
  const fits = (side: number) => side >= LOGO_MIN_SIDE && side <= LOGO_MAX_SIDE
  if (!fits(width) || !fits(height)) {
    throw new LogoError(
      `The logo must be between ${String(LOGO_MIN_SIDE)} and ${String(LOGO_MAX_SIDE)} pixels per side.`,
    )
  }
  const sha256 = createHash("sha256").update(data).digest("hex")
  return { contentType: found.contentType, width, height, sha256 }
}

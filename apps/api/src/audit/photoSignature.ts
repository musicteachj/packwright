/**
 * Whether a photograph's data is what its media type says, judged before a vision
 * call is counted.
 *
 * **Why it is here.** The route counted a call against the day's budget as soon as
 * the body parsed, and `data` only had to be one character long, so a caller could
 * spend the whole day's allowance on "images" the vision API refused at no cost to
 * them, and lock out every real user until the day turned
 * (`docs/security-review-2026-10-18.md`, finding 3). This refuses those for free.
 *
 * **What it proves is small, on purpose.** Base64 with the opening bytes of the
 * declared format is a file that starts like an image, not an image: decoding the
 * whole thing is the vision API's work, and a caller who goes to the trouble of a
 * valid header is a caller the per-client limit and the audit key are for.
 *
 * The signatures, each read from its specification on 2026-10-18:
 * - JPEG: the SOI marker X'FFD8' (ITU-T T.81, Table B.1), followed by another
 *   marker, and "All markers shall be assigned two-byte codes: a X'FF' byte
 *   followed by a second byte" (B.1.1.3), so the third byte is X'FF' too;
 * - PNG: "The first eight bytes of a PNG datastream always contain the following
 *   hexadecimal values: 89 50 4E 47 0D 0A 1A 0A" (PNG, Third Edition, W3C, §5.2);
 * - GIF: the Signature "GIF" and a Version of "87a" or "89a" (GIF89a, §17);
 * - WebP: the ASCII "RIFF", the file size, then the ASCII "WEBP" (RFC 9649, §2.4).
 */

import type { PhotoMediaType } from './extract'

/** Standard base64 with its padding, as the client's `btoa` writes it (`normalisePhoto.ts`). */
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

const ascii = (text: string): number[] => [...text].map((character) => character.charCodeAt(0))

/** Each format's opening bytes, with `undefined` where any byte may stand. */
const SIGNATURES: Record<PhotoMediaType, readonly (readonly (number | undefined)[])[]> = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/gif': [ascii('GIF87a'), ascii('GIF89a')],
  'image/webp': [[...ascii('RIFF'), undefined, undefined, undefined, undefined, ...ascii('WEBP')]],
}

/** The longest signature, in base64 characters: twelve bytes are sixteen. */
const OPENING_CHARACTERS = 16

/**
 * Why the data is not a photograph of its declared type, or `undefined` where it
 * starts as one.
 */
export function photoFault(mediaType: PhotoMediaType, data: string): string | undefined {
  if (data.length % 4 !== 0 || !BASE64.test(data)) {
    return 'The image data is not base64.'
  }
  const opening = Buffer.from(data.slice(0, OPENING_CHARACTERS), 'base64')
  const matches = SIGNATURES[mediaType].some(
    (signature) =>
      opening.length >= signature.length &&
      signature.every((byte, i) => byte === undefined || opening[i] === byte),
  )
  return matches ? undefined : `The image data does not begin as a ${mediaType} file does.`
}

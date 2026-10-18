/**
 * A filename for an exported label.
 *
 * Shared because it was written twice — once in the editor for `link.download`
 * and once in the API for `Content-Disposition`. Two copies of the same regex
 * means the browser and the server can name the same file differently, and which
 * one wins depends on what the browser honours.
 *
 * **Capped at `FILENAME_MAX_CHARACTERS`**, because the identifier is a label's
 * whole product identifier or statement of identity and the header grew with it: a
 * 40 KB `Content-Disposition` was produced, and at 50 KB the client's parser
 * refused the response (`docs/security-review-2026-10-18.md`, finding 1). A long
 * name is cut, never refused: the label is not changed, only what its file is called.
 */

/**
 * Characters kept before the extension, all of them ASCII by the replacement below.
 * Well inside the 255 bytes a macOS, Windows or Linux filename allows.
 */
export const FILENAME_MAX_CHARACTERS = 100

export function labelFilename(identifier: string, extension = 'pdf'): string {
  const safe = trimHyphens(
    trimHyphens(identifier.replace(/[^a-zA-Z0-9._-]+/g, '-')).slice(0, FILENAME_MAX_CHARACTERS),
  )
  return `${safe === '' ? 'label' : safe}.${extension}`
}

/**
 * The text without leading or trailing hyphens, by walking in from each end.
 *
 * Not `/^-+|-+$/g`: its second alternative is tried from every hyphen in a run and
 * scans to the run's end each time, so a run of n hyphens inside the name cost n²
 * steps (29 s for one export, finding 1 of the review above).
 */
function trimHyphens(text: string): string {
  let start = 0
  let end = text.length
  while (start < end && text[start] === '-') start++
  while (end > start && text[end - 1] === '-') end--
  return text.slice(start, end)
}

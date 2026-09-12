/**
 * A filename for an exported label.
 *
 * Shared because it was written twice — once in the editor for `link.download`
 * and once in the API for `Content-Disposition`. Two copies of the same regex
 * means the browser and the server can name the same file differently, and which
 * one wins depends on what the browser honours.
 */
export function labelFilename(identifier: string, extension = 'pdf'): string {
  const safe = identifier.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return `${safe === '' ? 'label' : safe}.${extension}`
}

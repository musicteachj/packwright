/**
 * Whether the editor's document still matches what was last saved.
 *
 * **Key order is why this is not `JSON.stringify`.** The editor's document is
 * built field by field in the store; a loaded one arrives through JSON from the
 * server and through Mongoose before that. Neither guarantees the order the
 * other used, so a direct string compare reports a label as modified the instant
 * it opens — and an unsaved-changes indicator that is always on is one nobody
 * reads, which is worse than not having it.
 *
 * `undefined` is dropped rather than serialised, because an optional field the
 * editor has never touched and one the server omitted are the same document.
 */
export function canonicalise(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value === null || typeof value !== 'object') return value
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return Object.fromEntries(entries.map(([k, v]) => [k, sortKeys(v)]))
}

/** What a saved label is, reduced to the parts a user can change. */
export interface DocumentSnapshot {
  readonly name: string
  readonly labelType: string
  readonly stock: unknown
  readonly data: unknown
}

export const sameDocument = (a: DocumentSnapshot, b: DocumentSnapshot): boolean =>
  canonicalise(a) === canonicalise(b)

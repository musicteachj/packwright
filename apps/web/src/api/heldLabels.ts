/**
 * The saved labels this browser holds the edit tokens for.
 *
 * Creating a label hands back a secret, and changing or deleting the label
 * needs it again (`apps/api/src/labels/labelDocumentRoutes.ts`). There are no
 * accounts, so this browser's storage is the only place it is kept: the Saved
 * labels page lists what is here, and nothing else. A label opened from a link
 * this browser did not save is readable and nothing more, and clearing the
 * browser's storage gives up the right to edit every label in it, for good. The
 * pages say both plainly.
 *
 * Stored as `[{ id, editToken }]`, newest first, under one key, in the
 * `packwright.<name>` form the audit key uses. Storage can be refused (a private
 * window, a full quota), so every label held is also kept in memory: what this
 * visit saved, it can still edit, and only the next visit loses it.
 */

export interface HeldLabel {
  readonly id: string
  readonly editToken: string
}

const HELD_LABELS_STORAGE = 'packwright.savedLabels'

/** What this visit holds, whether or not storage took it. Newest first. */
let inMemory: HeldLabel[] = []

const isHeldLabel = (entry: unknown): entry is HeldLabel =>
  typeof entry === 'object' &&
  entry !== null &&
  typeof (entry as HeldLabel).id === 'string' &&
  typeof (entry as HeldLabel).editToken === 'string'

/**
 * What storage holds, read fresh each time, so a label saved in another tab is
 * held here too. Anything unreadable is treated as nothing held rather than
 * thrown: a page that cannot read its list should still open.
 */
function stored(): HeldLabel[] {
  try {
    const raw = localStorage.getItem(HELD_LABELS_STORAGE)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isHeldLabel) : []
  } catch {
    return []
  }
}

function store(labels: readonly HeldLabel[]): void {
  try {
    localStorage.setItem(HELD_LABELS_STORAGE, JSON.stringify(labels))
  } catch {
    // Kept in memory only, for this visit.
  }
}

/** Every label this browser holds, newest first, each id once. */
export function heldLabels(): HeldLabel[] {
  const seen = new Set<string>()
  return [...inMemory, ...stored()].filter((label) => {
    if (seen.has(label.id)) return false
    seen.add(label.id)
    return true
  })
}

/** The token that opens label `id` for changes, if this browser holds it. */
export const editTokenFor = (id: string): string | undefined =>
  heldLabels().find((label) => label.id === id)?.editToken

/** Keeps a label just created, newest first. */
export function holdLabel(id: string, editToken: string): void {
  const label = { id, editToken }
  inMemory = [label, ...inMemory.filter((held) => held.id !== id)]
  store([label, ...stored().filter((held) => held.id !== id)])
}

/** Lets go of labels that were deleted or have expired. */
export function forgetLabels(ids: Iterable<string>): void {
  const gone = new Set(ids)
  if (gone.size === 0) return
  inMemory = inMemory.filter((held) => !gone.has(held.id))
  store(stored().filter((held) => !gone.has(held.id)))
}

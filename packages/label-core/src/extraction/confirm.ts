/**
 * Turning a reading into label data, one explicit act at a time.
 *
 * The rule this exists to make structural is `CLAUDE.md`'s: *nothing extracted
 * becomes label data silently*. A producer returns an `ExtractionResult` in
 * which every field is unverified; this is the only thing that converts one into
 * fields of a label, and it converts exactly the keys it is handed.
 *
 * **The accepted set is iterated, not consulted.** Walking the extraction and
 * asking whether each field was accepted computes the same answer today and is
 * the wrong shape: it makes the reading the source of what lands and the set a
 * filter over it, so a bug that loses the set produces a full document rather
 * than an empty one. Iterating the set makes an empty set produce nothing, which
 * is the failure direction this whole phase is arranged around.
 *
 * Modality-agnostic on purpose, like the contract above it. A Safety Data Sheet
 * path would confirm through this unchanged.
 */

import type { ExtractionResult } from '../types/index'

/**
 * The fields a user accepted, and nothing else.
 *
 * A key in `accepted` that the reading has no field for contributes nothing —
 * it cannot arise from a screen that offers only what was read, and treating it
 * as an error would make the caller handle a case it cannot produce.
 */
export function confirmed<T extends object>(
  result: ExtractionResult<T>,
  accepted: ReadonlySet<keyof T>,
): Partial<T> {
  const document: Partial<T> = {}
  for (const key of accepted) {
    const field = result.fields[key]
    if (field === undefined) continue
    document[key] = field.value
  }
  return document
}

/**
 * What no rule can judge on a layout, element by element, in the engine's words.
 *
 * Moved here from `apps/web` on 2026-10-10 so the MCP server says what the editor
 * says: the overprinted-symbol sentence below was report text the web app wrote
 * for itself. Written once. It used to be assembled twice, in the editor's store
 * and in the audit report, and both had to change the same way for the explanation
 * below to reach the rail. The audit's copy left out the overprinted-symbol half
 * on purpose — an audit layout is GHS and has no symbols — and here that half
 * simply finds nothing on one.
 *
 * Every reason is passed through as the engine wrote it. Where the engine says
 * part of its explanation is shared with other elements, that is passed through
 * too, so the findings rail can say the shared part once — grouping on a whole
 * string it was handed, rather than taking the engine's sentence apart.
 */
import type { LayoutOmission, ResolvedLayout } from '../layout/types'

export interface UncheckableReason {
  /** The whole sentence, exactly as the engine wrote it. */
  text: string
  /** Its two halves, where the second is shared with other elements. See `LayoutOmission.explanation`. */
  explanation?: NonNullable<LayoutOmission['explanation']>
}

export interface Uncheckable {
  elementId: string
  reasons: UncheckableReason[]
}

export function uncheckableIn(layout: ResolvedLayout | null): Uncheckable[] {
  const byElement = new Map<string, UncheckableReason[]>()
  const add = (elementId: string, reason: UncheckableReason) => {
    const existing = byElement.get(elementId)
    if (existing === undefined) byElement.set(elementId, [reason])
    else existing.push(reason)
  }

  for (const symbol of layout?.symbols ?? []) {
    if (symbol.overprintedBy.length > 0) {
      add(symbol.elementId, {
        text:
          `Artwork is printed over the ${symbol.symbology} symbol. A symbol with ink through ` +
          'it will not scan whatever its margins measure.',
      })
    }
    // A symbol drawn off the stock is not stated here. The engine records an
    // omission for it, for every edge, and stating it here too listed one
    // overrun twice.
  }

  for (const omission of layout?.omissions ?? []) {
    add(omission.elementId, {
      text: omission.reason,
      ...(omission.explanation === undefined ? {} : { explanation: omission.explanation }),
    })
  }

  return [...byElement.entries()].map(([elementId, reasons]) => ({ elementId, reasons }))
}

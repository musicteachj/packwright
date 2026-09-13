/**
 * Which omissions make an export worthless.
 *
 * The predicate was written out three times — twice in the API route and once in
 * the editor — each with a comment saying the client and server must agree. Three
 * copies of a rule that must agree is a rule that will eventually disagree: miss
 * one and the button offers an export the server refuses, or hides one it would
 * have served. It lives beside the type it interprets instead.
 */

import type { LayoutOmission, ResolvedLayout } from './types'

export function blockingOmissions(layout: ResolvedLayout): LayoutOmission[] {
  // An absent element means a blank page. A missing detail does not — the label
  // around it is real. See `LayoutOmission.scope`.
  return layout.omissions.filter((omission) => omission.scope === 'element')
}

/**
 * Everything the engine could not draw about one element.
 *
 * Both scopes, deliberately. `blockingOmissions` asks whether an export is worth
 * having, which only an absent element decides; this asks whether the element is
 * on the label *as asked for*, and a declaration with half its width past the
 * edge of the stock is not — however real the rest of the label around it is.
 */
export function omissionsForElement(layout: ResolvedLayout, elementId: string): LayoutOmission[] {
  return layout.omissions.filter((omission) => omission.elementId === elementId)
}

/**
 * Whether the engine printed this element in full.
 *
 * The question a rule has to ask before it certifies anything. An element the
 * engine recorded an omission against was not printed as asked for, and clearing
 * it on the strength of the document that asked for it is the false clearance
 * this project exists to prevent.
 */
export function wasFullyDrawn(layout: ResolvedLayout, elementId: string): boolean {
  return omissionsForElement(layout, elementId).length === 0
}

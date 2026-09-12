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

/**
 * Shared control styling for the form rails.
 *
 * Extracted when the rail split by label type. Two rails with their own copies
 * of these strings would drift, and the drift would be invisible: a GHS input a
 * shade different from a UPC-A one reads as sloppiness rather than as a bug, so
 * nothing would ever fail because of it.
 */
export const INPUT =
  'numeric bg-chrome-950 border-chrome-700 text-chrome-100 focus-visible:outline-notice w-full border px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1'

export const LABEL = 'text-chrome-300 flex flex-col gap-1 text-xs'

/** For a removable entry in a list the user has built up, e.g. a chosen statement. */
export const CHIP =
  'border-chrome-700 bg-chrome-900 text-chrome-200 flex items-start justify-between gap-2 border px-2 py-1 text-xs'

export const CHIP_REMOVE =
  'text-chrome-400 hover:text-danger focus-visible:outline-notice shrink-0 px-1 focus-visible:outline focus-visible:outline-2'

/**
 * The resting border, and the one an invalid field replaces it with.
 *
 * Kept out of the control strings below so the two can never both apply. Two
 * `border-*` utilities on one element are the same specificity, so which wins is
 * decided by their order in the generated stylesheet rather than by the order
 * they are written in the class attribute — an invalid field would have looked
 * correct or not depending on a build detail.
 *
 * `danger-edge` rather than `danger`: this is a rule around a box, which is the
 * job that token was measured for, and it clears 3:1 against every chrome
 * surface. The border is never the only signal — an invalid field also carries
 * its reason in the description beneath it.
 */
export const CONTROL_BORDER = 'border-chrome-700'
export const CONTROL_BORDER_INVALID = 'border-danger-edge'

/**
 * A measurement field: `TEXT_INPUT` plus `numeric`.
 *
 * Not `INPUT`, which still carries its own `border-chrome-700` because all three
 * un-migrated rails depend on it — and a control that took `INPUT` plus a
 * conditional invalid border would carry two `border-*` utilities at once, which
 * is the ambiguity `CONTROL_BORDER` exists to remove.
 */
export const MEASUREMENT_INPUT =
  'numeric bg-chrome-950 text-chrome-100 focus-visible:outline-notice w-full border px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1'

/**
 * `TextField`'s control — `INPUT` without `numeric`.
 *
 * `numeric` is IBM Plex Mono with tabular figures, and `INPUT` puts it on every
 * text field and all 19 selects alike. CLAUDE.md's rule is narrower than that:
 * monospace and tabular figures for identifiers and measurements, not for
 * running prose — but under `INPUT` a statement of identity ("Oat and almond
 * granola") or a supplier name ("Example solvent") renders in a face built for
 * columns of digits, for no reason connected to what it is. `MeasurementField`
 * keeps `INPUT`, unchanged, for the fields the rule is actually for.
 */
export const TEXT_INPUT =
  'bg-chrome-950 text-chrome-100 focus-visible:outline-notice w-full border px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1'

/**
 * `SelectField`'s control.
 *
 * Measured in a real browser: `INPUT`'s `padding-right` is 8px, identical to
 * the left, with the native dropdown arrow drawn inside that same 8px — so a
 * long option ("Standard — both measurement systems r...") is clipped
 * mid-word against the glyph, with no ellipsis to say so. `appearance-none`
 * removes the browser's own arrow and `pr-8` (32px) leaves the option text a
 * clear 24px before the glyph `SelectField` draws itself as a sibling. Also
 * drops `numeric` for the same reason `TEXT_INPUT` does — an option list is
 * prose ("Bottle", "Standard — both measurement systems"), not a measurement.
 */
export const SELECT =
  'bg-chrome-950 text-chrome-100 focus-visible:outline-notice w-full appearance-none border py-1.5 pr-8 pl-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1'

/**
 * `CheckboxField`'s control and its row.
 *
 * The box was measured at 13×13 in a 16px row — under WCAG 2.2 AA's 24×24
 * target-size floor — and the gap between box and word measured 0px, because
 * the two `<label>`s carrying that shape today have no class on them at all.
 * `size-4` (16px) is the box; `min-h-6` (24px) and `gap-2.5` (10px) are the
 * row. `items-start`, not `items-center`: a label that wraps to a second line
 * should keep its box level with the first line, not floating at the middle
 * of the whole block. `accent-notice` is already on the six GHS and UPC-A
 * checkboxes and on none of the fourteen US food ones.
 */
export const CHECKBOX_INPUT = 'accent-notice size-4 shrink-0'

export const CHECKBOX_LABEL = 'text-chrome-300 flex min-h-6 items-start gap-2.5 text-xs'

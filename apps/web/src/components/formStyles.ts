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

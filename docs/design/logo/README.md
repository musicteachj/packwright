# The Packwright mark

Made in Claude Design on 2026-10-17 from `../logo-brief.md`, in three rounds. Everything here is Claude Design's
export, kept byte for byte (it is excluded from lint and formatting for that reason). Open the two `.dc.html`
boards in a browser to see the rounds; they load `support.js` from beside them.

## What was chosen

**Direction 2b, a registration target on a dimension line.** A registration target, the mark printers use to
align plates, whose horizontal arm ends in the same tick marks as the canvas's dimension callouts. That pairing is
what makes it this app's mark rather than a generic crosshair. Ink is `chrome-100` (#ebe7e0) on dark and
`chrome-950` (#14120f) on light; no severity color, and no `notice` blue.

## How it was chosen

- **Round 1** (`mark-directions.dc.html`, lower half; `marks/1a` to `1d`): four directions. 1d, crop marks around
  a "P", was dropped by James. 1a, a plain target, read as a map's "locate me" icon and a rifle sight, and rotated
  it reads as a circle with a diagonal cross. 1b's filled quarters turned to a blob at 32 px and below. 1c, the
  target on a dimension line, was the only one tied to the app, but its tick ends were 44% of the mark's height
  and read as wings.
- **Round 2** (upper half; `marks/2a` to `2c`): 1c with ticks at 19%, 25% and 31%. 2a's ticks were too short to
  read as line ends; 2c's crowded the ring at 16 px. 2b, at 25% (8 of 32 units, 3 px at 16 px), was chosen.
- **Round 3** (`brand-files.dc.html`, `brand/`): the file set for 2b.

## Where it is used

| file | used as |
|---|---|
| `brand/mark-32.svg` | the geometry `apps/web/src/components/BrandMark.vue` draws inline, in `currentColor` |
| `brand/mark-16.svg` | the drawing in `apps/web/public/favicon.svg` |
| `brand/icon-32.png`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | copied unchanged to `apps/web/public/` |
| `brand/icon-16.png` | not used: `favicon.svg` covers 16 px, and `icon-32.png` is the raster fallback |
| `brand/og-image.png` | copied to `apps/web/public/`; the tags that point at it wait for Phase 8 (`docs/DESIGN.md`) |
| `brand/lockup*.svg`, `brand/mark-one-color.svg` | not used by the app; for documents, slides and print |
| `brand/loading-indicator.css` | not used: the app has nothing that waits on a spinner |

**`brand/favicon.svg` is not the shipped favicon.** It was meant to switch ink with the browser's theme, but it
came back with neither the switch nor a fill, so it rendered in default black and all but vanished on a dark tab
bar. `apps/web/public/favicon.svg` is `brand/mark-16.svg`'s path with that switch added: `chrome-950` ink by
default, `chrome-100` under `prefers-color-scheme: dark`.

The inputs Claude Design was given (screenshots, the color tokens, the design-system section of `DESIGN.md`)
are regenerated rather than stored; `../logo-brief.md` says how.

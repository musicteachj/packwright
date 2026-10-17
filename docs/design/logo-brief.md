# Packwright logo: brief for Claude Design

Paste everything below the line into a new Claude Design project, and attach the files it lists. It follows
the shape of Open Door's `docs/design/system/claude-design-brief.md`, which produced that app's logo in one
round.

What exists today: the mark is the text glyph ⊕ set in `notice` blue (`SiteHeader.vue`, `EditorView.vue`)
beside the wordmark "Packwright" in IBM Plex Sans semibold. The wordmark was lowercase until 2026-10-17. The
name is now capitalized everywhere it appears in text, and the lockup's casing is left to this round.
`docs/DESIGN.md` § Motifs names the registration target as the logo mark and the loading indicator. There is
no favicon: `apps/web/index.html` links none, and there is no social share image.

The attachments are regenerated, not stored: screenshots by a throwaway Playwright probe against the
production build, `theme-tokens.css` from the `@theme` block of `apps/web/src/assets/main.css`, and
`design-system.md` from `docs/DESIGN.md` § Design system. They live in the gitignored
`docs/ui-audit-2026-10-17/claude-design-upload/`.

---

# Packwright: logo, favicon and share image, one round

Packaging label compliance tool, portfolio piece; must read as a real, professional product.
It generates print-accurate GS1 retail barcodes, GHS chemical hazard labels and FDA food labels, and reports
why a label is non-compliant with a citation to the regulation for every finding.

The app's design system already exists and is not up for change: a warm graphite dark interface around a
paper-white label canvas, IBM Plex Sans and IBM Plex Mono, and ANSI Z535 severity colors. This round is the
mark only, and it has to belong to that system.

## Attached
- `01-landing.png`: the landing page, where the mark sits in the masthead today
- `02-editor.png`: the editor, the app's main screen, showing a finding in the compliance rail
- `03-header-lockup.png`: today's lockup at 2x, the ⊕ font glyph beside the wordmark
- `04-ghs-editor.png`: a GHS label with its findings, to show the severity colors in use
- `theme-tokens.css`: every color token, with hex values
- `design-system.md`: the design principles, type, motifs and anti-patterns

## Who sees it
Packaging engineers, regulatory and quality people, and portfolio reviewers. They trust instruments, not
mascots.

## Feel
A precise instrument from print production. Exacting, quiet, technical; closer to a prepress tool or an
engineering drawing than to a startup. The app is about measuring things against a standard, so measurement
notation is the brand: dimension callouts with tick ends, crop marks, registration targets.

## Lead concept
**A registration target**, the crosshair-in-a-circle printers use to align plates, drawn properly rather than
as the font glyph ⊕ it is today. Real registration marks have hairline strokes and crosshairs that run past
the circle; find a version of that which still holds at 16 px. It will also spin as the app's loading
indicator, so it must read well when rotated.

Worth exploring beside it, no more than two:
- crop-mark corners framing a "P"
- a registration target combined with a dimension callout tick

## Must
- Legible as a 16 px favicon, drawn on whole pixels (a separate 16 px drawing is fine).
- Work inline in the lockup "⟨mark⟩ Packwright": IBM Plex Sans 600, about 14 px, mark vertically centered on
  the wordmark. Show the lockup both as "Packwright" and as "packwright" and recommend one. The name is always
  capitalized in running text, so a lowercase wordmark would live in the lockup only.
- Use only these token colors:
  - background `chrome-950` #14120f (main) and `chrome-900` #1c1a16 (raised)
  - ink `chrome-100` #ebe7e0, paper `paper` #fdfcfa
  - `notice` #5aa9e6 as an optional accent only
- Pass WCAG 2.2 AA non-text contrast (3:1) on both backgrounds; state the ratios.
- Have a one-color version (black on paper) that survives printing.

## Avoid
- **Severity colors as brand color.** Red #ff5c4d, orange #f59340, yellow #f5ce4a and green #52c57e mean
  DANGER, WARNING, CAUTION and PASS (ANSI Z535) everywhere in this app. A mark in one of them reads as a
  finding. `notice` blue also names a severity, which is why it is an accent at most.
- Checkmarks, shields, badges, seals: they claim compliance, and this tool's whole point is that it only
  reports what it checked.
- Package and box icons, cubes, barcodes as the mark itself.
- Gradients, glows, purple or pink, rounded app-icon tiles with drop shadows.
- Anything resembling the owner's other marks: a door ajar (Open Door).

## Hand back
1. Round 1: three or four directions on `chrome-950`, each shown at 16, 32 and 64 px and in the lockup.
2. For the chosen one:
   - SVG master at 32 px
   - a 16 px favicon SVG
   - PNGs at 16, 32, 180 (apple-touch-icon) and 512
   - inline lockup
   - one-color version
   - a specimen card with contrast ratios
3. A short note on how the loading-indicator rotation should look (speed, which parts move).
4. A social share image, 1200 × 630, for when the link is posted or messaged: the lockup, the line
   "Print-accurate packaging labels, checked against the regulation, with a citation for every finding.", and
   at most one quiet print motif (crop marks or a dimension callout). It must stay legible as a small
   thumbnail.

One screen at a time. American English. No exclamation points.

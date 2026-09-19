# The interface: foundation, and the seven stages after it

Written 2026-09-18, against `dev` at `dc9af1f`. Runs ahead of phase 8, which stays held.

This came out of a UI and UX audit of every route at 375, 768 and 1440, taken from screenshots rather than
from reading components — the method `e2e/the-responsive-collapse.spec.ts` already records twice, once for
the masthead that clipped at 375 and once for the editor that scrolled sideways while every visibility
assertion passed. The audit produced thirty-eight findings. Almost none of them is a failure of the design
system; nearly all are failures to have built it.

---

## What is being decided

**The design system stays.** Graphite chrome derived *from* the ANSI palette rather than chosen ahead of it,
print-production motifs because that is the vocabulary of the industry this serves, IBM Plex because its
figures are tabular and the dimensions update live. Each link in that chain is load-bearing and the whole
thing survives a follow-up question, which is the property a generated theme does not have. Redesigning
toward a generic enterprise look would converge on Carbon or shadcn defaults and trade the one thing that
cannot be generated for the one thing that can.

It is also already inside the enterprise canon rather than outside it: IBM Plex *is* Carbon's typeface, and
Carbon's posture — productive density as task-dependent, hairlines over cards, compact data patterns — is
what `docs/DESIGN.md` describes. This is a domain dialect of the reference, which is the right place for a
specialist tool to sit.

**What is missing is the system, not the style.** `chrome.ts` holds three constants and `formStyles.ts` four.
Everything else is inline Tailwind: the checkbox row string appears twenty times, the help-paragraph string
twenty-nine, the focus ring in three different spellings. Both files open with a comment predicting that
copies of a style drift invisibly because nothing ever fails because of it. They were right, and they did
not prevent it — `accent-notice` is on all six GHS and UPC-A checkboxes and none of the fourteen US food
ones, and `BUTTON` deliberately carries no size, so three sizes ship.

**Foundation comes before fixes, because foundation removes fixes.** Fixing the checkbox gap by hand means
editing twenty-four call sites that a component layer would then rewrite. Eight separate audit findings —
the gap, the select gutter, the three button sizes, the three focus spellings, mono-on-prose, the sub-24px
targets, the `accent` drift, the help text that swallows a field's accessible name — stop being eight fixes
and become consequences of one component layer.

**Three defects are carved out ahead of it**, because they are broken now and the component work never
touches them. See stage 0.

---

## The four decisions taken in brainstorming

### Mono means identifier or measurement, and nothing else

`formStyles.ts:9` puts the `numeric` utility on `INPUT`, so every text field and all nineteen selects render
in IBM Plex Mono — "Oat and almond granola" included. `CLAUDE.md` says something narrower: *"monospace and
tabular figures for identifiers and measurements"*.

The rule is about content, not control type. A GTIN is a `type="text"` input and stays mono. A container-shape
select is prose and goes sans. The distinction lives in the component API — `TextField` against
`MeasurementField` — so it cannot be got wrong field by field.

The evidence that this is right is already in the rail. *"Principal display panel `44.64 in²` — 21 CFR
101.7(i) requires `4.76 mm`"* reads well, and it reads well **because the sentence around the figures is not
mono**. Uniform mono spends the signal everywhere and has none left where it matters.

**H- and P-statements split: the code is mono, the text is sans.** `H225` is an identifier; *"Highly flammable
liquid and vapour"* is a sentence, and a sentence set at 12px in mono is hard to read. This mirrors the
citation pattern the rail already uses. The argument against — that mono would signal "this string is fixed
and must not be edited", which is a real correctness property here — was considered and not taken, on the
grounds that the field is not editable anyway and legibility is the live concern.

### Three tokens per severity, and structure carries the statement kind

`main.css` defines five flat severity colours. `LabelsView.vue:87` and `:139` ask for `text-danger-300` and
`border-danger-600`, which are not tokens and therefore generate **no CSS rule at all** — confirmed against
the built stylesheet. So the app's one transport-error message and its one destructive action render in
inherited body colour.

The replacement is fifteen tokens: for each severity a `text`, an `edge` and a `surface`, each with a stated
job. Not the forty-five-step ramp Carbon and Tailwind ship — that buys flexibility with washed backgrounds
and tinted borders, which is the floating-tinted-card look `DESIGN.md` rules out in favour of hairlines, and
forty-five pairings is forty-five contrast assertions to carry in two themes.

With an `edge` token available, **the four kinds of statement separate by structure rather than by hue**:

| kind | treatment |
|---|---|
| Findings | full-bleed row, severity `edge` on the leading rule, severity `text` on the word |
| Cannot be checked | below a `NOT VERDICTS` rule, indented, dashed neutral edge, non-severity glyph |
| Checks that did not run | same container, same neutral treatment |
| No provision governs | still silent, still deliberately so |

This fixes the audit's second-ranked finding at its root. Today `FindingsRail.vue:174` renders "Cannot be
checked" using `SEVERITY_STYLES.advisory.icon` and `text-caution` — CAUTION's own glyph and colour — so in
the GHS rail it sits directly beneath two `▲ WARNING` findings and reads as a third one. Once structure
carries the kind, colour goes back to meaning severity and only severity.

**The wording does not change.** `docs/WHAT-IS-NOT-CHECKED.md` uses the exact phrases "checks that did not
run" and "cannot be checked" to explain the distinction to a reader, and `CLAUDE.md` requires any UI change
that alters what the report says to keep that document true. A clearer-sounding relabel would make the only
reader-facing document in the repository wrong. The structure does the work; the words stay.

### The component layer gets a front door at `/design`

A route rendering every control and every severity **from the same components the application uses**, so a
control that drifts there has drifted everywhere.

This is the argument `/rules` already won. That page is the strongest proof of depth in the app precisely
because it is generated from the registry rather than written alongside it, and therefore cannot describe a
check the engine does not run. `/design` is that trick applied to the interface, against exactly the failure
mode `chrome.ts` and `formStyles.ts` were created to prevent and did not.

It also earns its keep in stage 5: it is where the light theme gets checked, and it makes the contrast
figures visible instead of leaving them inside an assertion.

**Storybook is rejected**, on the project's own grounds. This repo chose Vitest over Jest specifically so
there would be no second transform config to keep in sync; Storybook is a second toolchain, a second build,
and a third thing that has to track Tailwind v4. It would deliver the same catalogue plus a dependency the
conventions were written to avoid.

---

## Stage 0 — the three that are broken

One branch. Roughly a hundred lines including tests.

**`LabelsView.vue:87, :139`.** Switch to real tokens and add the icon and word, so the error is not
colour-alone — it is currently the only surface in the app failing that rule in all three channels at once.

The test is the point. `LabelsView.test.ts:72` finds the delete button by `.text-danger-300` and passes green
against a class that styles nothing, which is how this shipped. **The new assertion reads a computed colour,
not a class string.** Mutation test: revert the token, the computed colour reverts with it.

**`AuditView.vue:368`.** `SiteHeader` sits outside `PAGE_INNER` here and inside it in every other view, so
the masthead spans the viewport with no `px-8` and no `max-w-5xl`. "Editor", the last nav link, is clipped by
the window edge at 375 **and** at 1440. Move it inside. Asserts: right edge within the viewport at both
widths, left edge aligned with `main`'s.

**`LabelCanvas.vue:42`.** `zoom` is `ref<Zoom>(1)` — 100%, never `fit`, at every viewport, and nothing
re-evaluates on resize. `DEFAULT_US_FOOD_STOCK` is 120 mm, which is 453 CSS px, so on a 375px phone the food
label is clipped off both edges — in the Preview pane, which is the pane the narrow editor deliberately opens
on. Default to `'fit'`, unconditionally; a conditional default is harder to reason about and 100% is one
click away. Asserts: at 375 the rendered width is no greater than the pane's.

`the-responsive-collapse.spec.ts` does not catch this today because it asserts the *document* does not scroll
sideways, and the overflow is inside the pane.

---

## Stage 1 — foundation

**Three pull requests, not one.** The rails are 2,060 + 481 + 415 lines and the migration touches nearly all
of it. `CLAUDE.md` makes size the trigger, and phase 5's fourteen-thousand-line branch is the recorded reason.

### PR 1 — tokens, components, `/design`

Fifteen severity tokens, declared in `main.css` in the commenting style already there, and one focus-ring
token replacing the three spellings. Then `apps/web/src/components/ui/`:

| component | what it owns |
|---|---|
| `Field` | the label / control / help triple, and the `for`/`id` pairing |
| `TextField`, `MeasurementField` | the typeface split, encoded so it cannot be got wrong |
| `SelectField` | `appearance-none`, a chevron inset to match the text inset, and a reserved gutter |
| `CheckboxField` | 16px box, 10px gap, ≥24px row, first-line alignment for wrapping labels |
| `HelpText` | help as a sibling of the control, never inside the `<label>` |
| `Button` | size variants, ending the three that ship today |
| `SectionHeading` | title and status slot |

`SelectField` matters more than it looks. Measured in the page, every select has `padding-right: 8px` with
nothing reserved for the native arrow, so long option text is clipped mid-word against the glyph with no
ellipsis — *"Standard — both measurement systems r"*.

`HelpText` fixes a defect as a side effect: `UsFoodFormRail.vue:1801-1815` nests its help prose *inside* the
`<label>`, making the field's accessible name a forty-word paragraph, and renders it in mono while the
identical prose two fields below is sans.

Then the `/design` route, plus the contrast figures.

### PR 2 — migrate `UpcAFormRail` and `GhsFormRail`

The smaller two first, so the component API meets real call sites before it meets the hard rail.

### PR 3 — migrate `UsFoodFormRail`

2,060 lines, 24 number inputs, 14 selects, 14 checkboxes. This one takes `/code-review high` on the PR.

### What stage 1 closes without separate work

The checkbox gap at all twenty-four sites — including `LabelCanvas.vue:342-359`, where the two overlay
labels carry no class at all and the measured gap between box and word is **0 px**. The `accent-notice`
drift. The select gutter at all nineteen. Three button sizes. Three focus spellings. Mono on prose. Hit
targets measured at 13×13 in 16px rows, against WCAG 2.2 AA's 24×24 floor. The accessible-name bug. The
missing `fieldset`/`legend` on the forty-four GHS hazard checkboxes, the nine allergens and the signal words.

---

## Stages 2 to 7

**2 · The report.** The structure above, plus de-duplication — two GHS pictograms currently produce two
byte-identical WARNING findings and a forty-word explanation printed twice — and a visible summary line, since
`FindingsRail.vue:134` renders the only summary `sr-only` and a sighted reader gets no headline at all. The
named facts under "checks that did not run" become a list that links to the fields that supply them, which is
the app's own finding → canvas → form interaction applied where it pays most.

**3 · The shell.** Persistent chrome across `/`, `/labels`, `/rules` and `/audit`, which today share only a
12px text nav in the corner and read as a typeset document rather than an application. The missing 404 route,
per-route `document.title`, a skip link and scroll restoration fall out of the same work.

**4 · Canvas and editor.** The numeric-input policy. `asMeasurement` (`UsFoodFormRail.vue:873`) refuses a
zero and deletes the key; where the field was never filled the bound value was already `undefined`, so Vue
never patches the element and **the box goes on showing a `0` the document does not hold** — read back from
the page as `0` after the guard had run. Where the field *did* hold a value, the same keystroke blanks the box
mid-edit instead. One key, two behaviours, and `min="0"` on all three advertises a value the guard refuses.
Plus the SVG callout's hardcoded font family with no tabular figures, and the editor's absent loading state.

**5 · Light theme.** The acid test that the tokens are real, and a hedge against the one place this app
diverges from its category: Veeva Vault, Kallik, Loftware, Esko WebCenter and GlobalVision are all light-mode
document-review tools, because the artefact under review is a printed document. The canvas wants dark; the
report wants light. `theme.test.ts` already parses `main.css` for contrast — it extends to two themes.

**6 · Saved labels.** Load more, a truncation indicator, and the label saved between two page fetches,
decided together. `listLabels` currently walks up to forty serial round trips behind a `Loading…` with no
`role="status"`.

**7 · bwip-js.** 934,645 bytes raw, 250,944 gzipped, on the landing critical path — and on `/labels/new` and
`/audit` too, because `stores/labelDocument.ts:40` imports it as well. The placeholder must hold the same box:
at 1440×900 the barcode is above the fold, so a smaller stand-in reflows the page under the reader.

---

## Verification

Every stage: `npm test` (baseline 69 files / 1,520 tests), `npm run typecheck` with `vue-tsc`, `npm run lint`
with its one expected `PaneSwitcher.vue` warning, `npx prettier --check .`, and `npm run test:e2e` once before
a PR. `/code-review medium` with no target before each commit; `/code-review high <PR#>` on any PR touching
`rules/`, `fda/` or `layout/` — which stage 2 will, since the report's grouping reads what the rules emit.

**Every fix is mutation-tested**: revert it, confirm a *named* test fails, restore, confirm the restore took.

**The standing question after any change here**: can a rule now pass on something the engine did not draw?
Stages 2 and 4 both touch what the report says, and the report is the product.

## What is deliberately not in this document

The dual-column dead end — where a package owing both 101.9(b)(12)(i) and (b)(2)(i)(D) cannot be made
compliant because the model holds one `basis` and one set of `secondAmounts`. It is a product and regulatory
question rather than an interface one, and probing it turned up a smaller interface defect worth recording
separately: switching "What the second column counts" between the two mandatory provisions changes nothing
visible in the rail.

Phase numbering. This work runs ahead of phase 8 and has not been given a number.

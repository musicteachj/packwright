# Interface stage 0 — the three that are broken

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` or
> `superpowers:executing-plans` to work through this task by task. Steps use checkbox (`- [ ]`) syntax.

> **This project forbids committing without per-action approval.** `CLAUDE.md` and the global rules both
> say so, and it is the rule the owner most wants held. Every commit step below therefore says **propose
> and stop** — draft the message, present it, and wait. Never run `git commit`, `git push` or `gh pr
> create` from this plan. This overrides the writing-plans skill's own "Commit" step.

**Goal:** Fix the three interface defects that are broken today and that the stage 1 component work will
never touch — a colour token that compiles to nothing, a masthead that clips its last link, and a canvas
that opens clipped on a phone.

**Architecture:** Three unrelated one-line fixes, each with the test that would have caught it. The first
one's test is the valuable part: rather than asserting the single fixed usage, it scans every component for
colour utilities and asserts each names a token `main.css` actually declares — so the whole class of defect
is closed, not the one instance.

**Tech stack:** Vue 3 `<script setup>`, Tailwind v4 (`@theme` tokens in `main.css`), Vitest + Vue Test Utils
(jsdom), Playwright for anything requiring layout.

**Spec:** `docs/specs/2026-09-18-interface-foundation-design.md`

**Branch:** cut from `dev`, named `fix/three-that-are-broken`. Leave `main` alone.

---

## Why some tests are Playwright and some are Vitest

jsdom has no layout engine and does not apply Tailwind's stylesheet. It cannot tell you a computed colour,
an element's width, or whether something is clipped. So:

- **Task 1** is Vitest, in `node` environment — it reads `main.css` as a file, which is how `theme.test.ts`
  already works.
- **Task 2** is Vitest + jsdom — it asserts rendered *text*, which jsdom can do.
- **Tasks 3 and 4** need real boxes, so their real assertions are Playwright. Task 4 also gets a cheap
  Vitest test for the default value itself.

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `apps/web/src/assets/theme.test.ts` | Token contract — contrast, provenance, and now existence | Modify |
| `apps/web/src/views/LabelsView.vue` | Saved-labels list; error and delete-confirm | Modify |
| `apps/web/src/views/LabelsView.test.ts` | Its component tests | Modify |
| `apps/web/src/views/AuditView.vue` | Audit route shell | Modify (template only) |
| `e2e/the-masthead.spec.ts` | Masthead fits and aligns on every reading route | Create |
| `apps/web/src/components/LabelCanvas.vue` | Canvas zoom default | Modify (one line) |
| `apps/web/src/components/LabelCanvas.test.ts` | Canvas component tests | Create |
| `e2e/the-canvas-fits.spec.ts` | The label fits its pane at phone width | Create |
| `CHANGELOG.md` | Updated **in the same edit** as each change, never after | Modify |

---

## Task 1: A colour utility may only name a token that exists

**Files:**
- Modify: `apps/web/src/assets/theme.test.ts` (append a new `describe`)
- Modify: `apps/web/src/views/LabelsView.vue:87` and `:139`
- Modify: `apps/web/src/views/LabelsView.test.ts:72` (the guard flags the test file too, deliberately)

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/assets/theme.test.ts`:

```ts
/**
 * The families that resolve to a `--color-*` token rather than to a Tailwind
 * built-in. `border-b` and `text-xs` are not colours and must not be caught.
 */
const COLOUR_FAMILIES = ['chrome', 'danger', 'warning', 'caution', 'notice', 'pass', 'paper'] as const

/** Every `--color-*` main.css actually declares. */
const DECLARED = new Set([...css.matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1] as string))

/**
 * Comments are prose, and prose has to be able to name a broken class in order
 * to explain it — the note inside the test below does exactly that. An earlier
 * draft of this guard scanned comments too and flagged its own explanation,
 * which is unfixable without either weakening the guard or forbidding a comment
 * from quoting a class name. Only code may *use* a utility, so comments come
 * out first.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*')
    })
    .join('\n')
}

describe('a colour utility may only name a token that exists', () => {
  it('no source file asks for a token main.css does not declare', () => {
    // `LabelsView` asked for `text-danger-300` and `border-danger-600` for a
    // phase. Neither is a token — `main.css` declares a flat `--color-danger` —
    // so Tailwind generated no rule at all and the saved-labels error and the
    // delete button rendered in inherited body colour. Nothing failed, because
    // the test that touched it selected on the class name, and a class name is
    // present whether or not it styles anything.
    const root = dirname(fileURLToPath(import.meta.url))
    const pattern = new RegExp(
      `\\b(?:text|bg|border|outline|accent|fill|stroke|ring|divide|decoration)-` +
        `(?:${COLOUR_FAMILIES.join('|')})(?:-[a-z0-9]+)?\\b`,
      'g',
    )

    const offenders: string[] = []
    for (const file of globSync(['../**/*.vue', '../**/*.ts'], { cwd: root })) {
      const source = withoutComments(readFileSync(join(root, file), 'utf8'))
      for (const [utility] of source.matchAll(pattern)) {
        const name = utility.slice(utility.indexOf('-') + 1)
        if (!DECLARED.has(name)) offenders.push(`${file} → ${utility}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and watch it fail, naming all four offenders**

Run: `npx vitest run apps/web/src/assets/theme.test.ts -t "no source file asks"`

Expected: FAIL, with the received array containing **four** entries:

```
../views/LabelsView.vue → border-danger-600      (line 87)
../views/LabelsView.vue → text-danger-300        (line 87)
../views/LabelsView.vue → text-danger-300        (line 139)
../views/LabelsView.test.ts → text-danger-300    (line 72)
```

The fourth is the point of the whole task and must not be excluded from the glob. The reason this defect
survived is that a *test* selected on a class that styles nothing, so a guard that ignored test files would
leave the trap that caught everyone last time.

**Exactly four, and `theme.test.ts` is not among them.** The first draft of this guard scanned comments as
well as code, so it flagged its own explanatory note — which quotes both broken class names in order to
explain them — and could never have gone green. `withoutComments` is why it does. If you see six offenders,
the stripper is missing.

If it passes here, the regex is wrong — stop and fix the test before touching `LabelsView`.

- [ ] **Step 3: Fix all four usages**

In `apps/web/src/views/LabelsView.vue`, line 87, change the error paragraph's class from
`"border-danger-600 text-danger-300 border-l-2 pl-4 text-sm"` to:

```
"border-danger text-danger border-l-2 pl-4 text-sm"
```

On line 139, replace the delete-confirm button with one that carries a test hook instead of relying on a
class name:

```html
              <button
                type="button"
                class="text-danger underline"
                data-confirm-delete
                @click="remove(label.id)"
              >
                Delete
              </button>
```

And in `apps/web/src/views/LabelsView.test.ts` line 72, change
`await wrapper.get('.text-danger-300').trigger('click')` to:

```ts
    await wrapper.get('[data-confirm-delete]').trigger('click')
```

A class name is present in the markup whether or not it styles anything, which is exactly how this shipped.
`data-save` and `data-save-state` in `EditorView.vue` are the house precedent for a test hook.

- [ ] **Step 4: Run both files and watch them pass**

Run: `npx vitest run apps/web/src/assets/theme.test.ts apps/web/src/views/LabelsView.test.ts`
Expected: PASS, every test in both files.

- [ ] **Step 5: Update `CHANGELOG.md` in this same edit**

Under `## [Unreleased]` → `### Fixed`:

```markdown
- **Two colour classes in the saved-labels view named tokens that do not exist.** `text-danger-300` and
  `border-danger-600` generated no CSS rule, because `main.css` declares a flat `--color-danger` and no
  scale, so the list's error message and its delete button rendered in inherited body colour. A test now
  reads every `--color-*` out of `main.css` and asserts that every colour utility in every component names
  one of them, so the class of defect is closed rather than the instance.
```

- [ ] **Step 6: Mutation-test the guard**

Temporarily revert line 87 to `border-danger-600 text-danger-300`. Run
`npx vitest run apps/web/src/assets/theme.test.ts -t "no source file asks"` and confirm it **fails**.
Restore the fix and confirm it **passes** again. A guard that passes without the fix is not a guard.

---

## Task 2: The saved-labels error does not rely on colour

**Files:**
- Modify: `apps/web/src/views/LabelsView.vue:85-91` (the error paragraph only — the delete button and its
  selector were both settled in Task 1)
- Modify: `apps/web/src/views/LabelsView.test.ts` (one assertion added to an existing test)

- [ ] **Step 1: Write the failing test**

In `apps/web/src/views/LabelsView.test.ts`, find the test `reports a failure without claiming the list is
empty` (it asserts on `[role="alert"]`) and add one line to it:

```ts
    // Colour is never the only signal. This is not a compliance finding, so it
    // borrows none of the severity vocabulary — no ⊘, no "DANGER" — just the
    // word, so a reader who cannot see the red still knows what they are reading.
    expect(wrapper.find('[role="alert"]').text()).toContain('Error')
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run apps/web/src/views/LabelsView.test.ts -t "reports a failure"`
Expected: FAIL — the alert's text is the server message only.

- [ ] **Step 3: Add the word**

In `apps/web/src/views/LabelsView.vue`, replace the error paragraph (lines 85–91) with:

```html
        <p
          v-if="error"
          class="border-danger text-danger border-l-2 pl-4 text-sm"
          role="alert"
        >
          <span class="font-semibold">Error</span> — {{ error }}
        </p>
```

- [ ] **Step 4: Run the file and watch it pass**

Run: `npx vitest run apps/web/src/views/LabelsView.test.ts`
Expected: PASS, every test in the file.

- [ ] **Step 5: Update `CHANGELOG.md` in this same edit**

Under `### Fixed`:

```markdown
- **The saved-labels error said "failed" in red and nowhere else.** It now carries the word as well as the
  colour. It deliberately borrows none of the ANSI severity vocabulary — a failed request is not a
  compliance finding and must not read as one.
```

- [ ] **Step 6: Mutation-test**

Remove `<span class="font-semibold">Error</span> — ` and confirm
`npx vitest run apps/web/src/views/LabelsView.test.ts -t "reports a failure"` **fails**. Restore and
confirm it passes.

---

## Task 3: The masthead fits and aligns on every reading route

**Files:**
- Create: `e2e/the-masthead.spec.ts`
- Modify: `apps/web/src/views/AuditView.vue:366-368`

- [ ] **Step 1: Write the failing test**

Create `e2e/the-masthead.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

/**
 * The masthead belongs to the page, not to the window.
 *
 * `AuditView` put `SiteHeader` outside `PAGE_INNER` while every other reading
 * route puts it inside, so on `/audit` the masthead got neither the page's
 * horizontal gutter nor its maximum width: the wordmark sat hard against the
 * left edge of the glass and the last nav link against the right, while the
 * content beneath them was inset and centred.
 *
 * **Measured on content, not on boxes.** The first version of this compared the
 * `<header>`'s bounding box with `<main>`'s, and passed on the broken page at
 * 375px: `PAGE_INNER`'s `px-8` is padding *inside* main's box and its
 * `max-w-5xl` does not bind below 1024, so both boxes were flush to the viewport
 * and identical while the visible content was inset by 32px on one and by
 * nothing on the other. What a reader sees is where the ink starts, so that is
 * what is asserted.
 */

const ROUTES = ['/', '/labels', '/rules', '/audit'] as const
const MASTHEAD = 'header:has(nav[aria-label="Sections"])'

for (const width of [375, 1440] as const) {
  for (const route of ROUTES) {
    test(`${route} sets its masthead in the page's column at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(route)
      await expect(page.locator(MASTHEAD)).toBeVisible()

      const wordmark = await page.locator(`${MASTHEAD} a`).first().boundingBox()
      const nav = await page.locator(`${MASTHEAD} nav`).boundingBox()
      const heading = await page.locator('main h1').first().boundingBox()
      expect(wordmark, 'the wordmark must be laid out').not.toBeNull()
      expect(nav, 'the nav must be laid out').not.toBeNull()
      expect(heading, 'the heading must be laid out').not.toBeNull()

      // Whatever the width resolves the page gutter to.
      const gutter = heading!.x

      expect(
        Math.abs(wordmark!.x - gutter),
        'the wordmark must start where the page content starts',
      ).toBeLessThanOrEqual(1)

      expect(
        Math.abs(width - (nav!.x + nav!.width) - gutter),
        'the nav must end as far from the right edge as the content is from the left',
      ).toBeLessThanOrEqual(1)
    })
  }
}
```

**No `getByRole('link', { name: 'Editor' })`.** Playwright's accessible-name match is a case-insensitive
substring by default, and both `LandingView` and `LabelsView` carry an "Open the editor" call to action —
so that locator resolves to two elements and throws a strict-mode violation before any assertion runs. The
nav's right edge is the last link's right edge anyway, so the gutter assertion covers it without the
ambiguity.

- [ ] **Step 2: Run it and watch only `/audit` fail**

Run: `npx playwright test the-masthead`

Expected: **6 passed, 2 failed** — the six `/`, `/labels` and `/rules` cases pass; both `/audit` cases fail,
at 375px on the wordmark assertion and at 1440px on both. If `/audit` passes at either width the test is
measuring the wrong thing; if any other route fails, stop and report rather than editing that view.

- [ ] **Step 3: Move the masthead inside the page frame**

In `apps/web/src/views/AuditView.vue`, replace lines 366–368:

```html
  <div :class="PAGE">
    <SiteHeader current="audit" />
    <main :class="PAGE_INNER">
```

with:

```html
  <div :class="PAGE">
    <div :class="PAGE_INNER">
      <SiteHeader current="audit" />

      <main class="flex flex-col gap-12">
```

This matches `LandingView.vue:43-47` exactly. `PAGE_INNER` carries `flex flex-col gap-12`, which `main` was
relying on, so `main` now states it itself.

- [ ] **Step 4: Close the two new tags at the end of the template**

At the bottom of `AuditView.vue`'s template there is `</main>` followed by `</div>`. Add one more closing
`</div>` so the new `PAGE_INNER` wrapper is closed:

```html
      </main>
    </div>
  </div>
</template>
```

- [ ] **Step 5: Run it and watch all eight pass**

Run: `npx playwright test the-masthead`
Expected: 8 passed.

- [ ] **Step 6: Confirm nothing else on `/audit` moved**

Run: `npx vitest run apps/web/src/views/AuditView.test.ts`
Expected: PASS. The change is structural markup only; if a test fails, a selector depended on the old
nesting and needs reading before it is changed.

- [ ] **Step 7: Update `CHANGELOG.md` in this same edit**

Under `### Fixed`:

```markdown
- **`/audit`'s masthead spanned the window instead of the page.** `SiteHeader` sat outside `PAGE_INNER`
  there and inside it on every other route, so the audit masthead had neither the page's horizontal padding
  nor its maximum width — it was misaligned with its own content, and "Editor" was clipped by the window
  edge at 375px and at 1440px alike. `e2e/the-masthead.spec.ts` now asserts fit and alignment on all four
  reading routes at both widths.
```

- [ ] **Step 8: Mutation-test**

Move `<SiteHeader current="audit" />` back above the `PAGE_INNER` div, run `npx playwright test
the-masthead`, and confirm the two `/audit` tests **fail**. Restore and confirm 8 pass.

---

## Task 4: The canvas opens at a zoom that fits

**Files:**
- Create: `apps/web/src/components/LabelCanvas.test.ts`
- Create: `e2e/the-canvas-fits.spec.ts`
- Modify: `apps/web/src/components/LabelCanvas.vue:42`

- [ ] **Step 1: Write the failing unit test**

Create `apps/web/src/components/LabelCanvas.test.ts`:

```ts
import type { ResolvedLayout } from '@packwright/label-core'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LabelCanvas from './LabelCanvas.vue'

/**
 * A US food label is 120mm wide, which is 453 CSS pixels. The editor opens on
 * the Preview pane below 1024px — deliberately, because the label is the thing
 * the tool exists to draw — so a canvas that opens at 100% shows a phone user a
 * label clipped off both edges before they have touched anything.
 */
const layout: ResolvedLayout = {
  widthMm: 120,
  heightMm: 240,
  primitives: [],
  elements: [],
  symbols: [],
  pictograms: [],
  omissions: [],
}

describe('the canvas zoom', () => {
  it('opens on Fit rather than on 100%', () => {
    const wrapper = mount(LabelCanvas, { props: { layout, title: 'A US food label' } })
    expect(wrapper.get('button[aria-pressed="true"]').text()).toBe('Fit')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run apps/web/src/components/LabelCanvas.test.ts`
Expected: FAIL — received `100%`.

- [ ] **Step 3: Change the default**

In `apps/web/src/components/LabelCanvas.vue`, line 42, change:

```ts
const zoom = ref<Zoom>(1)
```

to:

```ts
// Unconditionally `fit`, not "fit when it would overflow". A conditional
// default is harder to reason about than a constant one, 100% is one click
// away, and the case that matters — a 120mm food label on a 375px phone — is
// the one the editor opens on.
const zoom = ref<Zoom>('fit')
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run apps/web/src/components/LabelCanvas.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the browser test that states the real claim**

The unit test asserts a default; it cannot assert that the label fits, because jsdom has no layout. Create
`e2e/the-canvas-fits.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

/**
 * `the-responsive-collapse.spec.ts` asserts the *document* does not scroll
 * sideways, and that passed throughout: the overflow was inside the preview
 * pane, not the page. So the US food label sat 453 CSS pixels wide in a 375px
 * window with its first and last characters off both edges, and every existing
 * assertion was green.
 */
test('the label fits its pane at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto('/labels/new')
  await page.locator('#field-label-type').selectOption('us-food')

  const pane = page.locator('#pane-preview')
  await expect(pane).toBeVisible()

  const svg = page.locator('#pane-preview svg[role="img"]').first()
  await expect(svg).toBeVisible()

  const drawn = await svg.boundingBox()
  const box = await pane.boundingBox()
  expect(drawn, 'the label must be laid out').not.toBeNull()
  expect(box, 'the pane must be laid out').not.toBeNull()
  expect(
    drawn!.width,
    'the label is wider than the pane it is drawn in',
  ).toBeLessThanOrEqual(box!.width)
  expect(drawn!.x, 'the label starts off the left edge').toBeGreaterThanOrEqual(box!.x - 1)
})
```

- [ ] **Step 6: Run it**

Run: `npx playwright test the-canvas-fits`
Expected: PASS.

- [ ] **Step 7: Update `CHANGELOG.md` in this same edit**

Under `### Fixed`:

```markdown
- **The canvas opened at 100% at every width, so a food label did not fit a phone.** A 120mm US food label
  is 453 CSS pixels; below 1024px the editor opens on the Preview pane by design, so the first thing a
  phone showed was a label clipped off both edges. The zoom now opens on Fit. The existing responsive test
  could not see it: it asserts the document does not scroll sideways, and the overflow was inside the pane.
```

- [ ] **Step 8: Mutation-test both**

Set `zoom` back to `ref<Zoom>(1)`. Confirm `npx vitest run apps/web/src/components/LabelCanvas.test.ts`
**fails** and `npx playwright test the-canvas-fits` **fails**. Restore and confirm both pass.

---

## Task 5: Full verification, then propose the commit

- [ ] **Step 1: Run everything**

```bash
npm test
npm run typecheck
npm run lint
npx prettier --check .
npm run test:e2e
```

Expected:
- `npm test` — **70 test files passed | 1 skipped**, and **1,522 passed | 1 skipped**. That is the 69/1,520
  baseline plus one new file (`LabelCanvas.test.ts`) and exactly **two** new tests: the token guard and the
  canvas default. The `Error` check in Task 2 is an assertion added to a test that already existed, so it
  raises no count — if the total reads 1,523 someone wrote a third test and the plan should say so.
- `npm run typecheck` — clean.
- `npm run lint` — clean but for the one expected `PaneSwitcher.vue` warning.
- `npx prettier --check .` — clean. If it complains, run `npx prettier --write` on the named files only.
- `npm run test:e2e` — **42 passed**. That is the 33 baseline plus 8 masthead cases and 1 canvas case.

If any count differs from the above, stop and find out why before proceeding. A number that does not match
is the plan being wrong or a test not running, and both matter.

- [ ] **Step 2: Run the review the ladder asks for**

Run `/code-review medium` with **no target**, so it reviews the uncommitted diff. This diff touches neither
`rules/`, `fda/` nor `layout/`, so `medium` is the right rung and `max` is not needed.

Triage: fix anything in scope; record anything out of scope in `docs/BACKLOG.md` with the reasoning rather
than fixing it in passing.

- [ ] **Step 3: Ask the standing question**

`CLAUDE.md`: *can this rule now pass on something the engine did not draw?* For this stage the answer is no
— nothing here touches `rules/` or the renderer, and no finding's text, severity or citation changes. Record
that you asked.

- [ ] **Step 4: Propose the commit, and stop**

Draft a commit message as prose — why, in sentences, not a bullet dump — present it, and **wait for an
explicit yes**. Do not run `git commit`. Suggested shape:

> **Fix three things that were broken and invisible**
>
> Each was found by looking at a screenshot rather than by a failing test, and each had a test nearby that
> could not have caught it.
>
> `LabelsView` asked for `text-danger-300` and `border-danger-600`, neither of which is a token — `main.css`
> declares a flat `--color-danger` — so Tailwind generated no rule and the list's error and its delete
> button rendered in inherited body colour. The test that touched that button selected it by class name,
> and a class name is present whether or not it styles anything. The guard added here reads every
> `--color-*` out of `main.css` and asserts that every colour utility in every component names one of them,
> so what is closed is the class of defect rather than the instance.
>
> `/audit` put `SiteHeader` outside `PAGE_INNER` while every other route puts it inside, so its masthead
> spanned the window rather than the page and clipped "Editor" at 375px and at 1440px alike.
>
> And the canvas opened at 100% at every width, so a 120mm food label — 453 CSS pixels — did not fit a
> 375px phone, in the pane the narrow editor deliberately opens on. The responsive spec stayed green
> throughout because it asserts the document does not scroll sideways, and the overflow was inside the pane.

Approval is per-action. A yes on the commit is not a yes on the push, and the push is not the pull request.

---

## Self-review notes

Checked against `docs/specs/2026-09-18-interface-foundation-design.md` § *Stage 0*:

- "Switch to real tokens and add the icon and word" — **amended deliberately.** Tasks 1 and 2 add the *word*
  and not an icon, because every glyph in `severity.ts` belongs to a severity and a failed HTTP request is
  not a compliance finding. Borrowing `⊘` for it would repeat the exact mistake the spec criticises in
  "Cannot be checked", which wears CAUTION's glyph without being a verdict. The spec's intent — that colour
  is not the only signal — is met.
- "The new assertion reads a computed colour, not a class string" — **amended.** jsdom applies no
  stylesheet, so a computed colour is unavailable there, and a Playwright test would prove one usage. Task 1
  asserts the stronger and cheaper property instead: that the token named exists at all. It fails on the
  real defect (verified in Step 2) and covers every component rather than one line.
- Masthead and canvas tasks implement the spec as written.
- Task 5 records the "can a rule pass on something not drawn" question the project requires after any change.

Both amendments are improvements on the spec rather than departures from its intent, but they are departures
from its letter and are flagged here so the owner can overrule either.

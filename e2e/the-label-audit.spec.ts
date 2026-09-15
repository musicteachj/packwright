import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * A photograph, read, confirmed, and judged by the rule engine.
 *
 * The one test that walks the whole phase, and the only place the three parts
 * meet: a model reads, a person confirms, and `rules/` decides. What it asserts
 * is the sentence the phase exists to make true — that the verdict on screen
 * carries a citation, and that the citation belongs to a rule written in phase 4
 * rather than to anything on the audit path.
 *
 * **The reading is intercepted, not requested.** `page.route` fulfils
 * `/api/audit/**` from the recorded fixture, so this is deterministic, free, and
 * needs no key — the suite runs on a checkout that has never had one. The server
 * side of that call is covered by supertest; what the browser is here for is the
 * path from a file input to a finding.
 *
 * The extraction is **derived from the recorded reply** rather than written out
 * here. A hand-written one would be this repository's idea of what the model
 * returns, asserted against this repository's idea of what the model returns.
 */
const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'apps',
  'api',
  'src',
  'audit',
  'fixtures',
)

const recorded = JSON.parse(readFileSync(join(fixtures, 'recorded.json'), 'utf8')) as {
  content: { type: string; text?: string }[]
  model: string
}

const readFields = JSON.parse(
  recorded.content.find((block) => block.type === 'text')!.text!,
) as Record<string, unknown>

const SAMPLE = join(fixtures, 'sampleLabel.png')

test.describe.configure({ timeout: 60_000 })

test('reads a photographed label and judges it with a cited rule', async ({ page }) => {
  await page.route('**/api/audit/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        extraction: { fields: readFields, warnings: [] },
        model: recorded.model,
      }),
    }),
  )

  await page.setViewportSize({ width: 420, height: 900 })
  await page.goto('/audit')

  await page.selectOption('[data-test="regime"]', 'eu-clp')
  await page.setInputFiles('[data-test="photo-file"]', SAMPLE)
  // The premise: the photograph was normalised in the browser, not merely
  // attached. Without this the rest could pass against an inert file input.
  await expect(page.locator('[data-test="photo-preview"]')).toBeVisible()

  await page.click('[data-test="read"]')
  await expect(page.locator('[data-field="signalWords"]')).toBeVisible()

  // The label prints DANGER and WARNING together, which is what makes this
  // worth auditing at all.
  await expect(page.locator('[data-value="signalWords"]')).toHaveText('Danger, Warning')

  // Nothing is judged until it is confirmed, and nothing is confirmed here that
  // was not clicked.
  await expect(page.locator('[data-test="not-judged"]')).toHaveCount(0)

  await page.click('[data-test="accept-productIdentifier"]')
  await page.click('[data-test="accept-signalWords"]')
  await page.fill('[data-test="capacity"]', '1')
  await page.fill('[data-test="width"]', '74')
  await page.fill('[data-test="height"]', '105')

  const report = page.locator('[aria-labelledby="audit-report-heading"]')
  await expect(report).toBeVisible()

  // The finding, and the clause it rests on. CLP Article 20(3): "Where the
  // signal word 'Danger' is used on the label, the signal word 'Warning' shall
  // not appear on the label."
  await expect(report).toContainText('Regulation (EC) No 1272/2008 (CLP), Article 20(3)')
  await expect(report).toContainText('WARNING')

  // And the honest half: the rules judged a label built from what was
  // confirmed, and one field was read and left alone.
  await expect(page.locator('[data-test="unconfirmed"]')).toContainText('Hazard statements')

  // One live region on the page, not two announcing over each other.
  await expect(page.locator('[aria-live]')).toHaveCount(1)
})

test('hands the confirmed label to the editor without saving it', async ({ page }) => {
  await page.route('**/api/audit/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        extraction: { fields: readFields, warnings: [] },
        model: recorded.model,
      }),
    }),
  )

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/audit')
  await page.selectOption('[data-test="regime"]', 'eu-clp')
  await page.setInputFiles('[data-test="photo-file"]', SAMPLE)
  await page.click('[data-test="read"]')
  await expect(page.locator('[data-field="productIdentifier"]')).toBeVisible()

  await page.click('[data-test="accept-productIdentifier"]')
  await page.fill('[data-test="capacity"]', '1')
  await page.fill('[data-test="width"]', '74')
  await page.fill('[data-test="height"]', '105')
  await page.click('[data-test="open-in-editor"]')

  await expect(page).toHaveURL(/\/labels\/new$/)
  // Read as a property, not as an attribute. Vue binds `value` as a property,
  // so `input[value="Acetone"]` matches nothing however right the page is.
  await expect(page.locator('#field-ghs-product')).toHaveValue('Acetone')
  // No save-state indicator, and that is correct rather than a gap: it renders
  // only for a label that has a saved record behind it, and this one has never
  // been stored. That it is *dirty* — which is what keeps the leave guards
  // awake — is asserted in `views/EditorView.test.ts`, which mounts the editor
  // over the handed-over document. The store's own test passes either way,
  // because it never mounts anything, and that gap is how the editor silently
  // rebasing the baseline on mount survived.
  await expect(page.locator('[data-save-state]')).toHaveCount(0)
})

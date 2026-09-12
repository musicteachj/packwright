// @vitest-environment node
//
// Reads a file, so it needs Node rather than the jsdom default this workspace
// uses for component tests.

import {
  DEFAULT_GHS_STOCK,
  DEFAULT_UPC_A_STOCK,
  layOutGhsLabel,
  layOutUpcALabel,
} from '@packwright/label-core'
import * as bwip from 'bwip-js/generic'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Every face a layout asks for must exist on **both** sides.
 *
 * This test exists because the same defect shipped twice and was "fixed" twice
 * without ever being caught, each fix moving it rather than closing it.
 *
 * First the GHS template asked for `IBM Plex Sans Bold`, which the PDF exporter
 * does not embed, so print fell back to the regular weight while the browser
 * rendered bold. The fix renamed it to `IBM Plex Sans SemiBold`, which the
 * exporter *does* embed — and the browser does not declare, because the
 * stylesheet has one family at two weights, not two families. So the preview
 * fell back to the system sans instead and the divergence simply changed sides.
 *
 * The reason neither was caught is that the only guard checked the exporter's
 * allowlist. A font family is a contract between the layout and *two* renderers,
 * and a test that only reads one of them cannot see a mismatch with the other.
 * This is the missing half: it reads the stylesheet that actually ships.
 */

const css = readFileSync(fileURLToPath(new URL('./main.css', import.meta.url)), 'utf8')

/** Families the browser can actually resolve, read from `@font-face` rules. */
const declaredFamilies = new Set(
  [...css.matchAll(/@font-face\s*\{[^}]*?font-family:\s*'([^']+)'/g)].map((match) => match[1]!),
)

/** Weights declared for each family, for the same reason. */
const declaredWeights = new Map<string, Set<number>>()
for (const block of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
  const family = /font-family:\s*'([^']+)'/.exec(block[1]!)?.[1]
  const weight = /font-weight:\s*(\d+)/.exec(block[1]!)?.[1]
  if (!family) continue
  const weights = declaredWeights.get(family) ?? new Set<number>()
  weights.add(weight ? Number(weight) : 400)
  declaredWeights.set(family, weights)
}

function facesIn(layout: { primitives: readonly unknown[] }) {
  return layout.primitives.flatMap((primitive) => {
    const text = primitive as { kind: string; fontFamily?: string; fontWeight?: number }
    return text.kind === 'text'
      ? [{ family: text.fontFamily!, weight: text.fontWeight ?? 400 }]
      : []
  })
}

describe('every font a layout asks for is declared in the stylesheet that ships', () => {
  it('declares the families the stylesheet is expected to carry', () => {
    // Guards the parse itself: a regex that silently matched nothing would make
    // every assertion below vacuously true.
    expect(declaredFamilies).toContain('IBM Plex Sans')
    expect(declaredFamilies).toContain('IBM Plex Mono')
    expect(declaredWeights.get('IBM Plex Sans')).toEqual(new Set([400, 600]))
  })

  it.each([
    [
      'GHS chemical',
      () =>
        layOutGhsLabel({
          data: {
            regime: 'eu-clp',
            productIdentifier: 'Acetone',
            capacityL: 5,
            signalWords: ['Danger'],
            pictograms: ['GHS02'],
            hazardStatementCodes: ['H225'],
            supplier: { name: 'Example Chemicals Ltd', address: '1 Example Way' },
          },
          stock: DEFAULT_GHS_STOCK,
        }),
    ],
    [
      'UPC-A retail',
      () =>
        layOutUpcALabel(bwip as never, {
          data: { gtin: '036000291452' },
          stock: DEFAULT_UPC_A_STOCK,
        }),
    ],
  ])('resolves every face the %s label asks for', (_name, build) => {
    const faces = facesIn(build())
    expect(faces.length).toBeGreaterThan(0)

    for (const { family, weight } of faces) {
      expect(declaredFamilies, `no @font-face declares the family "${family}"`).toContain(family)
      expect(
        declaredWeights.get(family),
        `"${family}" is declared, but not at weight ${weight}`,
      ).toContain(weight)
    }
  })

  it('asks for weight rather than naming a bold family, which the browser cannot resolve', () => {
    const faces = facesIn(
      layOutGhsLabel({
        data: {
          regime: 'eu-clp',
          productIdentifier: 'Acetone',
          capacityL: 5,
          signalWords: ['Danger'],
        },
        stock: DEFAULT_GHS_STOCK,
      }),
    )
    // The signal word is emphasised, and the emphasis lives in the weight.
    expect(faces.some((face) => face.weight === 600)).toBe(true)
    expect(faces.every((face) => !/bold|semibold/i.test(face.family))).toBe(true)
  })
})

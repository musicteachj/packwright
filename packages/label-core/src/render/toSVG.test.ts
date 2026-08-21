import { describe, expect, it } from 'vitest'
import type { LayoutPrimitive, ResolvedLayout } from '../layout/types'
import { toSVG } from './toSVG'

/**
 * Escaping, asserted rather than assumed.
 *
 * The browser renders this output through `v-html`, and the suppression there
 * justifies itself by claiming this renderer escapes every value it
 * interpolates. That claim was false for `fill` and `stroke` until the stage 3
 * review, and the correction shipped with no test — so the claim was true and
 * unverified, which is only marginally better than false.
 *
 * Colours are literals everywhere today. These tests are not about a reachable
 * exploit; they are about the invariant the suppression rests on staying true as
 * the fill values stop being literals.
 */

const wrap = (primitives: LayoutPrimitive[]): ResolvedLayout => ({
  widthMm: 50,
  heightMm: 20,
  symbols: [],
  primitives,
})

const BREAKOUT = '000000"/><script>alert(1)</script><rect fill="'

describe('toSVG escapes every interpolated value', () => {
  it('escapes a rect fill', () => {
    const svg = toSVG(
      wrap([{ kind: 'rect', xMm: 1, yMm: 1, widthMm: 2, heightMm: 2, fill: BREAKOUT }]),
    )
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;script&gt;')
  })

  it('escapes a line stroke', () => {
    const svg = toSVG(
      wrap([
        {
          kind: 'line',
          x1Mm: 0,
          y1Mm: 0,
          x2Mm: 5,
          y2Mm: 5,
          strokeWidthMm: 0.2,
          stroke: BREAKOUT,
        },
      ]),
    )
    expect(svg).not.toContain('<script>')
  })

  it('escapes a text fill and the text itself', () => {
    const svg = toSVG(
      wrap([
        {
          kind: 'text',
          xMm: 1,
          baselineYMm: 5,
          text: '</text><script>alert(1)</script>',
          fontSizeMm: 2,
          fontFamily: BREAKOUT,
          fill: BREAKOUT,
          anchor: 'start',
        },
      ]),
    )
    expect(svg).not.toContain('<script>')
    // Exactly one text element: a payload that closed its own tag early would
    // produce a second. Asserting on the string '</text><' instead matches the
    // legitimate closing tag before '</svg>' and fails on correct output.
    expect(svg.match(/<text /g) ?? []).toHaveLength(1)
    expect(svg).toContain('&lt;/text&gt;')
  })

  it('escapes the element id and the accessible title', () => {
    const svg = toSVG(
      wrap([
        {
          kind: 'rect',
          xMm: 1,
          yMm: 1,
          widthMm: 2,
          heightMm: 2,
          fill: '000000',
          elementId: BREAKOUT,
        },
      ]),
      { title: BREAKOUT },
    )
    expect(svg).not.toContain('<script>')
  })

  it('leaves ordinary values untouched', () => {
    // The escaping must not corrupt what it is protecting.
    const svg = toSVG(
      wrap([{ kind: 'rect', xMm: 1, yMm: 2, widthMm: 3, heightMm: 4, fill: '1a2b3c' }]),
    )
    expect(svg).toContain('fill="#1a2b3c"')
    expect(svg).toContain('x="1" y="2" width="3" height="4"')
  })
})

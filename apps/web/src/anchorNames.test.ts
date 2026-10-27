import { ANCHORS } from '@packwright/label-core'
import { describe, expect, it } from 'vitest'
import { anchorName } from './anchorNames'

describe('a placement as the menus show it', () => {
  it('is spelled the American way', () => {
    expect(ANCHORS.map(anchorName).filter((name) => /centre/.test(name))).toEqual([])
    expect(anchorName('bottom-centre')).toBe('bottom-center')
    expect(anchorName('centre')).toBe('center')
  })

  it('leaves the placements without a center alone', () => {
    expect(anchorName('top-left')).toBe('top-left')
  })
})

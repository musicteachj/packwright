import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editTokenFor, forgetLabels, heldLabels, holdLabel } from './heldLabels'

const STORAGE = 'packwright.savedLabels'

beforeEach(() => {
  localStorage.clear()
  forgetLabels(heldLabels().map((label) => label.id))
})
afterEach(() => vi.restoreAllMocks())

describe('the labels this browser holds', () => {
  it('keeps each label’s token in storage, newest first', () => {
    holdLabel('a', 'ta')
    holdLabel('b', 'tb')
    expect(JSON.parse(localStorage.getItem(STORAGE) ?? '[]')).toEqual([
      { id: 'b', editToken: 'tb' },
      { id: 'a', editToken: 'ta' },
    ])
    expect(editTokenFor('a')).toBe('ta')
    expect(editTokenFor('c')).toBeUndefined()
  })

  it('holds a label saved in another tab, read from storage', () => {
    localStorage.setItem(STORAGE, JSON.stringify([{ id: 'elsewhere', editToken: 't' }]))
    expect(editTokenFor('elsewhere')).toBe('t')
  })

  it('reads storage it cannot make sense of as nothing held', () => {
    localStorage.setItem(STORAGE, '{not json')
    expect(heldLabels()).toEqual([])
    localStorage.setItem(STORAGE, JSON.stringify([{ id: 1 }, { id: 'ok', editToken: 't' }]))
    expect(heldLabels()).toEqual([{ id: 'ok', editToken: 't' }])
  })

  it('still lets this visit change what it saved when storage refuses to keep it', () => {
    // A private window or a full quota: the token lasts as long as the page.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    holdLabel('a', 'ta')
    expect(editTokenFor('a')).toBe('ta')
  })

  it('lets go of labels by id', () => {
    holdLabel('a', 'ta')
    holdLabel('b', 'tb')
    forgetLabels(['a'])
    expect(heldLabels()).toEqual([{ id: 'b', editToken: 'tb' }])
    expect(localStorage.getItem(STORAGE)).not.toContain('ta')
  })
})

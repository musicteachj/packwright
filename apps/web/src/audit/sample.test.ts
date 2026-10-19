import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { SAMPLE } from './sample'

describe('the sample reading', () => {
  it('cannot be edited, all the way down, so every load shows what was recorded', () => {
    const held = ref(SAMPLE.reading)
    expect(() => {
      ;(held.value.extraction.fields.signalWords!.value as string[]).push('Caution')
    }).toThrow(TypeError)
    expect(SAMPLE.reading.extraction.fields.signalWords?.value).toEqual(['Danger', 'Warning'])
  })
})

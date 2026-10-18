import { describe, expect, it } from 'vitest'
import { photoFault } from './photoSignature'

const b64 = (bytes: number[]) => Buffer.from(bytes).toString('base64')
const ascii = (text: string) => [...text].map((character) => character.charCodeAt(0))

/** The opening bytes each specification gives, padded out as a real file would be. */
const OPENINGS = {
  'image/jpeg': [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...ascii('JFIF'), 0, 1],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...ascii('IHDR')],
  'image/gif': [...ascii('GIF89a'), 1, 0, 1, 0, 0x80, 0, 0],
  'image/webp': [...ascii('RIFF'), 0x24, 0x08, 0, 0, ...ascii('WEBPVP8 ')],
} as const

describe('photoFault', () => {
  it.each(Object.entries(OPENINGS))('takes data that begins as %s does', (mediaType, bytes) => {
    expect(photoFault(mediaType as keyof typeof OPENINGS, b64([...bytes]))).toBeUndefined()
  })

  it('takes both versions of GIF', () => {
    expect(photoFault('image/gif', b64([...ascii('GIF87a'), 1, 0, 1, 0, 0, 0]))).toBeUndefined()
  })

  it.each([
    ['image/png', OPENINGS['image/jpeg']],
    ['image/jpeg', OPENINGS['image/png']],
    ['image/webp', [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')]],
    ['image/gif', ascii('GIF88a')],
  ] as const)('refuses data declared %s that begins as something else', (mediaType, bytes) => {
    expect(photoFault(mediaType, b64([...bytes]))).toBe(
      `The image data does not begin as an ${mediaType} file does.`,
    )
  })

  it.each([
    ['one character', 'A'],
    ['a length that is not a multiple of four', b64([...OPENINGS['image/png']]).slice(0, -1)],
    ['characters outside base64', 'iVBORw0KGgo-AAAANSUhEUg=='],
    ['a data URL', `data:image/png;base64,${b64([...OPENINGS['image/png']])}`],
  ])('refuses %s as not base64', (_name, data) => {
    expect(photoFault('image/png', data)).toBe('The image data is not base64.')
  })

  it('refuses data too short to carry the signature', () => {
    expect(photoFault('image/png', b64([0x89, 0x50, 0x4e]))).toBe(
      'The image data does not begin as an image/png file does.',
    )
  })
})

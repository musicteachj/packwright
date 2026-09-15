import { describe, expect, it, vi } from 'vitest'
import {
  MAX_LONG_EDGE_PX,
  normalisePhoto,
  PHOTO_MEDIA_TYPE,
  scaleFor,
  type PhotoPipeline,
} from './normalisePhoto'

describe('the size a photograph is drawn at', () => {
  it('leaves a photograph already inside the limit alone', () => {
    // Never scaled up. Enlarging invents detail and buys visual tokens for
    // pixels that carry none.
    expect(scaleFor(1200, 900)).toEqual({ widthPx: 1200, heightPx: 900 })
    expect(scaleFor(MAX_LONG_EDGE_PX, 100)).toEqual({ widthPx: MAX_LONG_EDGE_PX, heightPx: 100 })
  })

  it('caps the long edge at the figure the API itself downscales to', () => {
    // A 12 MP phone photograph. 2576 is the high-resolution tier's own limit on
    // Claude Opus 5, so this loses nothing the model would have seen.
    const { widthPx, heightPx } = scaleFor(4032, 3024)
    expect(widthPx).toBe(MAX_LONG_EDGE_PX)
    expect(heightPx).toBe(1932)
  })

  it('caps the long edge whichever edge that is', () => {
    const portrait = scaleFor(3024, 4032)
    expect(portrait.heightPx).toBe(MAX_LONG_EDGE_PX)
    expect(portrait.widthPx).toBe(1932)
  })

  it('holds the aspect ratio to within a pixel', () => {
    const before = 4032 / 3024
    const { widthPx, heightPx } = scaleFor(4032, 3024)
    expect(Math.abs(widthPx / heightPx - before)).toBeLessThan(0.002)
  })

  it('never lands one pixel over the limit', () => {
    // The long edge is pinned to the limit and only the short edge is computed,
    // so rounding cannot overshoot: the short edge is by definition no longer
    // than the one that was pinned.
    for (const long of [2577, 2580, 3000, 4001, 5000, 8000]) {
      const { widthPx, heightPx } = scaleFor(long, Math.round(long * 0.618))
      expect(Math.max(widthPx, heightPx)).toBeLessThanOrEqual(MAX_LONG_EDGE_PX)
    }
  })

  it('refuses a photograph with no dimensions rather than inventing some', () => {
    expect(() => scaleFor(0, 0)).toThrow()
    expect(() => scaleFor(Number.NaN, 100)).toThrow()
  })
})

/** A pipeline that records what it was asked for and returns known bytes. */
const fakePipeline = (width: number, height: number) => {
  const encode = vi.fn(async () => new Uint8Array([1, 2, 3, 4]))
  const close = vi.fn()
  const pipeline: PhotoPipeline = {
    decode: vi.fn(async () => ({ width, height, close })),
    encode,
  }
  return { pipeline, encode, close }
}

describe('normalising a photograph', () => {
  it('encodes at the capped size, not the size that came in', async () => {
    const { pipeline, encode } = fakePipeline(4032, 3024)
    const photo = await normalisePhoto(new Blob(), pipeline)

    expect(encode).toHaveBeenCalledWith(expect.anything(), MAX_LONG_EDGE_PX, 1932)
    expect(photo.widthPx).toBe(MAX_LONG_EDGE_PX)
    expect(photo.heightPx).toBe(1932)
  })

  it('hands back base64 with no data-URL prefix, which is the shape the API takes', async () => {
    const { pipeline } = fakePipeline(100, 100)
    const photo = await normalisePhoto(new Blob(), pipeline)
    expect(photo.data.startsWith('data:')).toBe(false)
    expect(photo.mediaType).toBe(PHOTO_MEDIA_TYPE)
    expect(photo.data.length).toBeGreaterThan(0)
  })

  it('releases the decoded bitmap even when encoding fails', async () => {
    // A held bitmap is memory a phone does not have, and the failure path is
    // where it would be leaked.
    const { pipeline, close } = fakePipeline(100, 100)
    pipeline.encode = vi.fn().mockRejectedValue(new Error('no encoder'))
    await expect(normalisePhoto(new Blob(), pipeline)).rejects.toThrow('no encoder')
    expect(close).toHaveBeenCalled()
  })

  it('survives a photograph larger than a spread call can take', async () => {
    // `String.fromCharCode(...bytes)` is the short way to base64 and overflows
    // the call stack around a hundred thousand arguments, which a photograph
    // passes comfortably. Half a megabyte here; a real one is larger still.
    const big = new Uint8Array(512 * 1024).fill(65)
    const pipeline: PhotoPipeline = {
      decode: async () => ({ width: 100, height: 100 }),
      encode: async () => big,
    }
    const photo = await normalisePhoto(new Blob(), pipeline)
    expect(photo.data.length).toBeGreaterThan(600_000)
  })
})

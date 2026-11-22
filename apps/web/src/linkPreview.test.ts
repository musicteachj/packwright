// @vitest-environment node
//
// Reads files from disk, so it needs Node rather than the jsdom default this
// workspace uses for component tests.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The tags a link preview is drawn from, read out of `index.html` itself.
 *
 * A link pasted into a chat or a post is previewed from these tags alone: the
 * crawler that reads them runs no script, so they have to be in the page the
 * server sends rather than set by the client. They need the site's absolute
 * address, because a crawler resolves nothing against the page it read.
 */
const SITE = 'https://packwright.jameslittlefield.net/'
const IMAGE = 'https://packwright.jameslittlefield.net/og-image.png'

/** Every `<meta>` in `index.html` as its attributes, comments left out. */
const TAGS: readonly Record<string, string>[] = [
  ...readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .matchAll(/<meta\b([^>]*)>/g),
].map(([, attributes]) =>
  Object.fromEntries([...attributes!.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v])),
)

/** The `content` of the one `<meta>` with this `property` (Open Graph) or `name`. */
function meta(key: string): string | undefined {
  const tags = TAGS.filter((tag) => tag.property === key || tag.name === key)
  expect(tags.length, `one meta tag for ${key}`).toBeLessThanOrEqual(1)
  return tags[0]?.content
}

/** A PNG's own size, from its IHDR chunk: width then height, big-endian, at bytes 16 and 20. */
function pngSize(path: URL): { width: number; height: number } {
  const bytes = readFileSync(fileURLToPath(path))
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

describe('link-preview tags', () => {
  it('names the page and reuses its description', () => {
    expect(meta('og:type')).toBe('website')
    expect(meta('og:site_name')).toBe('Packwright')
    expect(meta('og:title')).toBeTruthy()
    expect(meta('og:description')).toBeTruthy()
    expect(meta('og:description')).toBe(meta('description'))
  })

  it('points at the site and its preview image by absolute address', () => {
    expect(meta('og:url')).toBe(SITE)
    expect(meta('og:image')).toBe(IMAGE)
    expect(meta('og:image:alt')).toBeTruthy()
  })

  it('declares the image at 1200 by 630, the size the file actually is', () => {
    expect(meta('og:image:width')).toBe('1200')
    expect(meta('og:image:height')).toBe('630')
    expect(pngSize(new URL('../public/og-image.png', import.meta.url))).toEqual({
      width: 1200,
      height: 630,
    })
  })

  it('asks for the large summary card', () => {
    expect(meta('twitter:card')).toBe('summary_large_image')
  })

  it('gives every Open Graph address as an absolute https one', () => {
    const urls = TAGS.filter((tag) =>
      /^og:(url|image)(:url|:secure_url)?$/.test(tag.property ?? ''),
    ).map((tag) => tag.content ?? '')
    expect(urls.length).toBeGreaterThanOrEqual(2)
    for (const url of urls) expect(new URL(url).protocol, url).toBe('https:')
  })
})

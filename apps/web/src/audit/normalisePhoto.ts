/**
 * A photograph, as the vision API should receive it.
 *
 * Three things happen here and each is a decision rather than housekeeping.
 *
 * **Orientation is applied to the pixels.** Claude receives no image metadata —
 * the vision documentation says so outright — so a phone photograph carrying
 * EXIF orientation 6 is read on its side, and a label read sideways is a label
 * read badly. `createImageBitmap` is asked for `from-image` so the rotation is
 * baked in before the bytes leave.
 *
 * **The long edge is capped at 2576 px.** That is the high-resolution tier's own
 * limit on Claude Opus 5: anything larger is downscaled to it by the API before
 * the model sees it. So capping here loses nothing the model would have used and
 * saves sending megabytes that get thrown away. This is **not** the downsampling
 * `docs/DESIGN.md` warns against, which is about going *below* that figure — and
 * the distinction is worth keeping straight, because the naive reading of that
 * warning sends a twelve-megapixel photograph the API immediately discards most
 * of.
 *
 * **Nothing is ever scaled up.** A small photograph is a small photograph;
 * enlarging it invents detail and costs visual tokens for pixels that carry
 * none.
 */

/** The long-edge limit of Claude Opus 5's high-resolution tier. */
export const MAX_LONG_EDGE_PX = 2576

/** JPEG, and quality high enough that small type survives. */
export const PHOTO_MEDIA_TYPE = 'image/jpeg'
export const PHOTO_QUALITY = 0.92

export interface LabelPhoto {
  mediaType: typeof PHOTO_MEDIA_TYPE
  /** Base64, with no `data:` prefix — the shape the API takes. */
  data: string
  widthPx: number
  heightPx: number
}

/**
 * The size to draw at, given the size that came in.
 *
 * Pure, and separated from the drawing so the arithmetic can be checked against
 * figures rather than against a canvas that does not exist in jsdom.
 */
export function scaleFor(
  widthPx: number,
  heightPx: number,
): { readonly widthPx: number; readonly heightPx: number } {
  const longest = Math.max(widthPx, heightPx)
  if (!Number.isFinite(longest) || longest <= 0) {
    throw new Error('A photograph with no dimensions cannot be normalised.')
  }
  if (longest <= MAX_LONG_EDGE_PX) return { widthPx, heightPx }

  // The long edge is *set* to the limit rather than multiplied towards it, and
  // only the short edge is computed. Scaling both and flooring was the first
  // version and it lost a pixel on the commonest case there is: an exact 4:3
  // photograph, 4032 x 3024, where 3024 * (2576 / 4032) is exactly 1932 in
  // arithmetic and 1931.9999999999998 in binary floating point. Flooring that
  // gives 1931 and a picture very slightly the wrong shape.
  //
  // Rounding the short edge cannot overshoot, because it is by definition no
  // longer than the edge that was pinned to the limit.
  const scale = MAX_LONG_EDGE_PX / longest
  const short = (edge: number) => Math.max(1, Math.round(edge * scale))
  return widthPx >= heightPx
    ? { widthPx: MAX_LONG_EDGE_PX, heightPx: short(heightPx) }
    : { widthPx: short(widthPx), heightPx: MAX_LONG_EDGE_PX }
}

/**
 * The browser calls this needs, injected so the path is testable.
 *
 * jsdom has neither `createImageBitmap` nor a canvas that encodes, and the
 * decisions worth testing are about what is asked for — the orientation flag,
 * the cap, the media type — rather than about whether Chromium can draw.
 */
export interface PhotoPipeline {
  /**
   * `ImageBitmapSource`, not `Blob`, so a file and a video frame are one path.
   *
   * `createImageBitmap` takes both, which means the camera still and the chosen
   * file are normalised by the same code rather than by two implementations of
   * the same three decisions.
   */
  decode: (
    source: ImageBitmapSource,
  ) => Promise<{ width: number; height: number; close?: () => void }>
  /**
   * Bytes rather than a `Blob`, which is what this module actually wants.
   *
   * It returned a `Blob` first, and that made the seam untestable for a reason
   * that has nothing to do with the code: jsdom's `Blob` has no `arrayBuffer`,
   * so every test of the encode path failed on the reading rather than on
   * anything being wrong. A seam whose type forces its own fake to be a browser
   * is the wrong seam.
   */
  encode: (
    source: { width: number; height: number },
    widthPx: number,
    heightPx: number,
  ) => Promise<Uint8Array>
}

const browserPipeline: PhotoPipeline = {
  decode: (source) => createImageBitmap(source, { imageOrientation: 'from-image' }),
  encode: async (source, widthPx, heightPx) => {
    const canvas = document.createElement('canvas')
    canvas.width = widthPx
    canvas.height = heightPx
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('This browser did not provide a 2D canvas.')
    context.drawImage(source as CanvasImageSource, 0, 0, widthPx, heightPx)
    const encoded = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, PHOTO_MEDIA_TYPE, PHOTO_QUALITY),
    )
    if (encoded === null) throw new Error('This browser could not encode the photograph.')
    return new Uint8Array(await encoded.arrayBuffer())
  },
}

/**
 * Base64 without spreading the array into a call.
 *
 * `String.fromCharCode(...bytes)` is the short version and overflows the call
 * stack somewhere around a hundred thousand arguments — which a photograph
 * passes comfortably. The chunk size is arbitrary and small enough to be safe
 * everywhere.
 */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK))
  }
  return btoa(binary)
}

export async function normalisePhoto(
  from: ImageBitmapSource,
  pipeline: PhotoPipeline = browserPipeline,
): Promise<LabelPhoto> {
  const source = await pipeline.decode(from)
  try {
    const { widthPx, heightPx } = scaleFor(source.width, source.height)
    const bytes = await pipeline.encode(source, widthPx, heightPx)
    return { mediaType: PHOTO_MEDIA_TYPE, data: toBase64(bytes), widthPx, heightPx }
  } finally {
    source.close?.()
  }
}

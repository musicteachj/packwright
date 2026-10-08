/**
 * bwip-js, loaded when a barcode is first drawn rather than with the page.
 *
 * It is 934,645 bytes raw and 250,944 gzipped, and two modules imported it statically:
 * the landing page and the editor's store. So `/`, `/audit` and every editor route —
 * including one opened on a GHS or food label, which draws no barcode — waited for it
 * before rendering. Measured from the built client on 2026-10-08.
 *
 * **What it actually supplies is narrow.** `label-core` lays the symbol out from its own
 * verified tables: the bar pattern's width in modules, the quiet zones, the bar heights,
 * where the human-readable digits go. bwip-js answers one question — which modules are
 * dark — and the engine checks its answer against the tabulated width.
 *
 * **So the placeholder is drawn by the real engine.** `placeholderUpcALayout` hands it a
 * stand-in that reports one span of exactly the verified width, lets it compute every
 * figure it computes for the real thing, and removes the symbol's ink. The frame, the
 * dimensions, the X-dimension and the clear space beside it are the engine's own, so the
 * figure holds the same box before and after the bars arrive — at every width, by
 * construction rather than by a measured height that holds at one. At 1440×900 the
 * barcode sits above the fold, which is why the box matters.
 *
 * The placeholder is for drawing only. Nothing is judged against it: the store holds
 * every rule back until the encoder is here.
 */
import { ref, shallowRef } from 'vue'
import {
  barPatternWidthMm,
  layOutUpcALabel,
  listSymbologies,
  type ResolvedLayout,
  type UpcALayoutRequest,
} from '@packwright/label-core'

/** The slice of bwip-js `label-core` calls, as `layOutUpcALabel` declares it. */
type BarcodeEncoder = Parameters<typeof layOutUpcALabel>[0]

/** bwip-js once it has loaded; `null` until then. Shared, so it loads once per page. */
export const barcodeEncoder = shallowRef<BarcodeEncoder | null>(null)

let loading: Promise<void> | undefined

/**
 * Whether the encoder failed to load, so a page can say so rather than wait for ever.
 *
 * **There is no retry within the page.** A browser keeps a failed module fetch in its
 * module map, so importing the same chunk again does not succeed. The first version
 * forgot the failure and asked again, and in a browser test the editor then said
 * "Loading the barcode encoder…" indefinitely. A reload is what tries again, and the
 * message says so.
 */
export const barcodeEncoderFailed = ref(false)

/** Starts the load if nothing has, and resolves once the encoder is ready. */
export function loadBarcodeEncoder(): Promise<void> {
  loading ??= import('bwip-js/generic').then(
    (module) => {
      barcodeEncoder.value = module as unknown as BarcodeEncoder
    },
    (error: unknown) => {
      barcodeEncoderFailed.value = true
      throw error
    },
  )
  return loading
}

/**
 * A renderer that knows how wide a symbol is and nothing about its bars.
 *
 * It reports one span of the verified module width, centred on the pattern, through the
 * same drawing call bwip-js makes — so `layOutSymbol`'s own check that the bars span the
 * tabulated width passes on the engine's numbers rather than on ours.
 */
const verifiedSpanOnly = {
  render(
    options: Record<string, unknown>,
    drawing: {
      line(x0: number, y0: number, x1: number, y1: number, lw: number, rgb: string): void
      end(): unknown
    },
  ): unknown {
    const symbology = listSymbologies().find((constraints) => constraints.bwipId === options.bcid)
    const modules = symbology === undefined ? undefined : barPatternWidthMm(symbology.id, 1)
    if (modules === undefined) {
      throw new Error(
        `No verified module width for the symbology bwip-js calls "${String(options.bcid)}".`,
      )
    }
    drawing.line(modules / 2, 0, modules / 2, 1, modules, '000000')
    return drawing.end()
  },
}

/**
 * The label as the engine lays it out, with the symbol's ink left out.
 *
 * Every element, every symbol fact and the label's own size are the real layout's; only
 * the primitives belonging to a symbol — its bars and its digits — are gone, so the
 * paper is blank where they will be drawn.
 */
export function placeholderUpcALayout(request: UpcALayoutRequest): ResolvedLayout {
  const layout = layOutUpcALabel(verifiedSpanOnly as never, request)
  const symbolIds = new Set(layout.symbols.map((symbol) => symbol.elementId))
  return {
    ...layout,
    primitives: layout.primitives.filter(
      (primitive) => primitive.elementId === undefined || !symbolIds.has(primitive.elementId),
    ),
  }
}

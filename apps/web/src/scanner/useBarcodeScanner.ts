/**
 * The camera, the detector, and the loop between them.
 *
 * Split from the component because everything interesting here is state rather
 * than markup: which engine is reading, whether permission was refused, whether
 * a symbol has been seen. A component that owned all of it could only be tested
 * by mounting a camera.
 */

import { onUnmounted, readonly, ref, type ShallowRef } from 'vue'
import { createDetector, type DetectorEngine, type SelectedDetector } from './detector'

/**
 * Where the scanner is, in the reader's terms rather than the API's.
 *
 * `unsupported` and `denied` are deliberately distinct. A browser without a
 * camera and a user who said no need different sentences: one is a dead end and
 * the other is a decision that can be changed, and telling someone to check their
 * browser settings when they pressed "Block" is how a tool loses trust.
 */
export type ScannerState = 'idle' | 'starting' | 'scanning' | 'denied' | 'unsupported' | 'failed'

export interface ScannerOptions {
  /** The element the frames arrive in. Owned by the component that renders it. */
  readonly video: Readonly<ShallowRef<HTMLVideoElement | null>>
  /**
   * Injected so the scan path is testable without a camera. jsdom has neither
   * `BarcodeDetector` nor `getUserMedia`, and the decisions worth testing are
   * about what happens to a value once it has been read.
   */
  readonly detectorFactory?: () => Promise<SelectedDetector>
  readonly getMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  /**
   * The engine offered the frame the browser's own detector failed on. Injected
   * so a test of that branch does not load a megabyte of WebAssembly into jsdom.
   */
  readonly zxingFactory?: () => Promise<SelectedDetector>
  /** Called with each raw symbol value read. */
  readonly onRead: (rawValue: string, format: string) => void
}

/**
 * Rear camera where there is one, and enough resolution to resolve a bar.
 *
 * The default stream is 640×480, which puts a UPC-A module at about five pixels
 * once the pack is far enough away to fit in frame — and five is under what the
 * reader needs. Asking for 1280 is `ideal` rather than `exact` so a device that
 * cannot manage it still opens rather than refusing outright.
 */
const CAMERA: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  audio: false,
}

/**
 * Eight frames a second.
 *
 * Fast enough that a steady hand reads within a second, slow enough that a phone
 * is not decoding continuously — zxing runs the whole decode on the main thread,
 * and at frame rate it makes the page stutter while the user is trying to hold
 * the camera still.
 */
const INTERVAL_MS = 125

/**
 * How many barren frames before the browser's own detector is asked to prove
 * itself — sixty-four, about eight seconds.
 *
 * **Because `getSupportedFormats` is a claim, not a demonstration.** Chromium in
 * headless mode reports `upc_a` and `ean_13` as supported and then returns an
 * empty array from every `detect` call, for ever, against a frame zxing reads
 * immediately. Nothing in the API says so, and a user cannot tell it apart from a
 * camera that will not focus: they hold the phone steadier, move closer, give up.
 *
 * **A barren frame is usually just aiming**, which is why the window is eight
 * seconds and not the two it started at. Two seconds downgraded a perfectly good
 * native detector on any device where someone took a moment to line the pack up —
 * trading a platform decoder for wasm on the main thread because the user was
 * slow. Eight is longer than anyone spends aiming and far shorter than the time
 * it takes to conclude an application is broken.
 *
 * A sharper version is possible and is not what ships: offer zxing the very frame
 * native failed on and swap only if zxing reads it, which tells "this detector is
 * broken" from "nothing is in shot" exactly rather than by a timer. It was
 * abandoned when `detect` hung there every time with no error — and that was not
 * the comparison's doing at all but a mismatched pair of `zxing-wasm` glue and
 * binary, since fixed and guarded by `wasmPairing.test.ts`. The counter ships
 * because it is what is written and green; `docs/BACKLOG.md` carries the
 * comparison as work now unblocked.
 */
const NATIVE_TRIAL_TICKS = 64

/**
 * The same window in milliseconds, which is the form a test needs it in.
 *
 * Exported so `useBarcodeScanner.test.ts` can advance a fake clock to the edges
 * of the window rather than sleep through it. It used to hard-code five seconds
 * against a window that was two, and when the window became eight the test for
 * the swap timed out while the test for *not* swapping early began passing
 * without ever reaching the swap at all — a constant moved and took the evidence
 * with it.
 */
export const NATIVE_TRIAL_MS = NATIVE_TRIAL_TICKS * INTERVAL_MS

export function useBarcodeScanner(options: ScannerOptions) {
  const state = ref<ScannerState>('idle')
  const engine = ref<DetectorEngine | null>(null)
  const message = ref<string | null>(null)
  let stream: MediaStream | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let detector: SelectedDetector | undefined
  /**
   * Bumped by every `start` and every `stop`, so a startup that was abandoned
   * midway cannot finish. `getUserMedia` is a permission prompt and can take as
   * long as the user does: closing the panel while it is open used to leave the
   * resuming `start` to set `scanning`, attach the stream and begin ticking, with
   * nothing left holding a reference to stop it — a camera running behind a
   * closed panel.
   */
  let generation = 0
  /** A decode in flight, so a slow frame cannot queue up behind itself. */
  let reading = false
  /** Frames offered to the browser's own detector without it reading anything. */
  let barrenTicks = 0

  /**
   * The browser's camera, unless one was handed in.
   *
   * The "no camera API here" check belongs to *this* function rather than to
   * `start`, because it is only knowable about the real one. Checking
   * `navigator.mediaDevices` up front made every injected stream report
   * `unsupported` in jsdom — a scanner that answered "your browser cannot do
   * this" to a camera that had been handed to it.
   */
  const media =
    options.getMedia ??
    ((constraints: MediaStreamConstraints) => {
      if (typeof navigator === 'undefined' || navigator.mediaDevices === undefined) {
        return Promise.reject(
          Object.assign(new Error('no camera API'), { name: 'NotSupportedError' }),
        )
      }
      return navigator.mediaDevices.getUserMedia(constraints)
    })
  const makeDetector = options.detectorFactory ?? createDetector

  async function start() {
    if (state.value === 'scanning' || state.value === 'starting') return
    const mine = ++generation
    const abandoned = () => mine !== generation

    state.value = 'starting'
    message.value = null

    try {
      const selected = await makeDetector()
      if (abandoned()) return
      detector = selected
      engine.value = selected.engine
    } catch {
      if (abandoned()) return
      state.value = 'failed'
      message.value = 'The barcode reader could not start.'
      return
    }

    let opened: MediaStream
    try {
      opened = await media(CAMERA)
    } catch (error) {
      if (abandoned()) return
      // `NotAllowedError` is a decision, not a fault, and is worded as one.
      const name = error instanceof Error ? error.name : ''
      if (name === 'NotAllowedError') {
        state.value = 'denied'
        message.value = 'Camera access was declined. The GTIN can be typed or pasted instead.'
      } else if (name === 'NotSupportedError') {
        state.value = 'unsupported'
        message.value = 'This browser does not offer camera access to a web page.'
      } else {
        state.value = 'failed'
        message.value = 'No camera was available.'
      }
      return
    }

    if (abandoned()) {
      // Stopped while the prompt was open. The stream still has to be released:
      // it was granted, and nothing else is holding it.
      for (const track of opened.getTracks()) track.stop()
      return
    }
    stream = opened

    const element = options.video.value
    if (element !== null) {
      element.srcObject = stream
      await element.play().catch(() => undefined)
    }
    if (abandoned()) return stop()

    barrenTicks = 0
    state.value = 'scanning'
    timer = setInterval(() => void tick(), INTERVAL_MS)
  }

  /**
   * The symbols in a frame, or none — including when the detector throws.
   *
   * **A rejection has read nothing, which is what an empty array says too, and
   * the two have to count the same.** They did not: a throw was swallowed on its
   * own and `barrenTicks` stayed at zero, so a detector that rejected every frame
   * — Chromium's answer when the platform's barcode service is unavailable —
   * never used up its window and never lost the camera. The one failure the trial
   * exists to rescue was the one it could not see.
   */
  async function symbolsIn(source: SelectedDetector, frame: HTMLVideoElement) {
    try {
      return await source.detector.detect(frame)
    } catch {
      // A frame that will not decode is the normal case between reads, not an
      // error worth showing anyone. It is still a frame that read nothing.
      return []
    }
  }

  async function tick() {
    const element = options.video.value
    if (reading || detector === undefined || element === null) return
    // A video with no frame yet decodes to nothing and throws on some engines.
    if (element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return

    reading = true
    try {
      const symbols = await symbolsIn(detector, element)
      const first = symbols[0]
      if (first !== undefined) {
        options.onRead(first.rawValue, first.format)
        barrenTicks = 0
      } else if (detector.engine === 'native' && ++barrenTicks >= NATIVE_TRIAL_TICKS) {
        await fallBackToZxing()
      }
    } catch {
      // Everything a frame can do is handled above, so this is `onRead` — the
      // store refusing a scan — and a refusal must not stop the camera.
    } finally {
      reading = false
    }
  }

  /**
   * The real ponyfill, for when no factory was handed in.
   *
   * Reached through a dynamic import rather than the one at the top of the file
   * so that a jsdom test of the swap can inject its own detector instead of
   * loading a megabyte of WebAssembly to prove a branch.
   */
  async function defaultZxing(): Promise<SelectedDetector> {
    const { createZxingDetector } = await import('./detector')
    return createZxingDetector()
  }

  /**
   * Hands the frames to zxing after the browser's own detector has had its window.
   *
   * Swapped rather than restarted: the camera is already open and pointed at the
   * pack, and tearing the stream down to rebuild it would blink the preview and
   * make the permission look as though it were being asked for twice. The next
   * tick reads through the new engine.
   */
  async function fallBackToZxing() {
    barrenTicks = 0
    try {
      const candidate = await (options.zxingFactory ?? defaultZxing)()
      detector = candidate
      engine.value = candidate.engine
    } catch {
      // Nothing further to try. The native detector keeps its frames; it may yet
      // read, and swapping to nothing would guarantee it does not.
    }
  }

  function stop() {
    generation += 1
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
    // Tracks are stopped explicitly. A `MediaStream` dropped on the floor leaves
    // the camera light on until garbage collection, which reads to the person
    // holding the phone as an application still watching them.
    for (const track of stream?.getTracks() ?? []) track.stop()
    stream = undefined
    if (options.video.value !== null) options.video.value.srcObject = null
    if (state.value === 'scanning' || state.value === 'starting') state.value = 'idle'
  }

  onUnmounted(stop)

  return {
    state: readonly(state),
    engine: readonly(engine),
    message: readonly(message),
    start,
    stop,
  }
}

/**
 * Getting a photograph of a label, by either of the two ways there are.
 *
 * **The file input is the primary path and the camera is the second.** On a
 * phone, `capture="environment"` opens the native camera and hands back a
 * full-resolution photograph with the device's own focus and exposure behind
 * it; on a desktop it picks a file. The in-page camera earns its place for the
 * live framing it gives and for a desktop with a webcam, not because the file
 * input is lacking.
 *
 * Both paths end at `normalisePhoto`, because `createImageBitmap` takes a file
 * and a video element alike. Two ways in, one set of decisions about
 * orientation, size and encoding.
 *
 * **The camera lifecycle here is a copy of the scanner's, not a share of it.**
 * The generation guard, the wording that separates a declined permission from an
 * absent API, the explicit track release — all of it was worked out in
 * `useBarcodeScanner` and each part exists because of something that went wrong
 * there. Copying it is a debt, and it is recorded in `docs/BACKLOG.md` rather
 * than paid here: one camera composable extracted from two is a refactor of
 * tested code and wants its own change, not a passenger on a feature.
 */

import { onUnmounted, readonly, ref, type ShallowRef } from 'vue'
import { CAMERA } from '../scanner/useBarcodeScanner'
import { normalisePhoto, type LabelPhoto, type PhotoPipeline } from './normalisePhoto'

/**
 * Where the camera has got to.
 *
 * `denied` and `unsupported` are separate for the reason the scanner separates
 * them: one is a browser that cannot, the other is a person who said no, and
 * telling someone to check their browser settings when they pressed Block is how
 * a tool loses trust.
 */
export type CaptureState = 'idle' | 'starting' | 'previewing' | 'denied' | 'unsupported' | 'failed'

export interface LabelPhotoOptions {
  /** The element frames arrive in. Owned by the component that renders it. */
  readonly video: Readonly<ShallowRef<HTMLVideoElement | null>>
  /** Injected so the camera path is testable where there is no camera. */
  readonly getMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  /** Injected so the encode path is testable where there is no canvas. */
  readonly pipeline?: PhotoPipeline
}

export function useLabelPhoto(options: LabelPhotoOptions) {
  const state = ref<CaptureState>('idle')
  const message = ref<string | null>(null)
  const photo = ref<LabelPhoto | null>(null)
  const reading = ref(false)
  let stream: MediaStream | undefined

  /**
   * Bumped by every `start` and every `stop`, so a startup abandoned midway
   * cannot finish. `getUserMedia` is a permission prompt and takes as long as
   * the user does; closing the panel while it is open must not leave a resuming
   * `start` to attach a stream nothing is holding a reference to.
   */
  let generation = 0

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

  const normalise = (from: ImageBitmapSource) =>
    options.pipeline === undefined ? normalisePhoto(from) : normalisePhoto(from, options.pipeline)

  async function start(): Promise<void> {
    if (state.value === 'previewing' || state.value === 'starting') return
    const mine = ++generation
    const abandoned = () => mine !== generation

    state.value = 'starting'
    message.value = null

    // Anything still open is let go before another is asked for. A frame that
    // could not be read leaves the state at `failed` with the camera still
    // running, and `start()` proceeds from `failed` — so without this the
    // assignment below overwrote the only reference to a live stream and
    // orphaned it for the life of the page.
    releaseStream()
    generation = mine

    let opened: MediaStream
    try {
      opened = await media(CAMERA)
    } catch (error) {
      if (abandoned()) return
      const name = error instanceof Error ? error.name : ''
      if (name === 'NotAllowedError') {
        state.value = 'denied'
        message.value =
          'Camera access was declined. A photograph can be chosen from a file instead.'
      } else if (name === 'NotSupportedError') {
        state.value = 'unsupported'
        message.value =
          'This browser does not offer camera access to a web page. A photograph can be chosen from a file instead.'
      } else {
        state.value = 'failed'
        message.value = 'No camera was available. A photograph can be chosen from a file instead.'
      }
      return
    }

    if (abandoned()) {
      // Stopped while the prompt was open. The stream was granted and nothing
      // else is holding it, so it is this branch's job to let it go.
      for (const track of opened.getTracks()) track.stop()
      return
    }

    stream = opened
    const element = options.video.value
    if (element !== null) {
      element.srcObject = opened
      try {
        await element.play()
      } catch {
        // Autoplay refusals are not fatal: the stream is attached and the frame
        // is grabbable whether or not the element chose to animate it.
      }
    }
    if (abandoned()) return
    state.value = 'previewing'
  }

  /** Lets the camera go without saying anything about what the screen is doing. */
  function releaseStream(): void {
    generation += 1
    for (const track of stream?.getTracks() ?? []) track.stop()
    stream = undefined
    const element = options.video.value
    if (element !== null) element.srcObject = null
  }

  function stop(): void {
    releaseStream()
    if (state.value !== 'denied' && state.value !== 'unsupported') state.value = 'idle'
  }

  /** The frame on screen, as a photograph. */
  async function capture(): Promise<void> {
    const element = options.video.value
    if (element === null || state.value !== 'previewing') return
    const read = await take(element)
    // The camera is released as soon as there is a photograph. Leaving it
    // running behind a still image is a light on a phone for no reason.
    //
    // Which release depends on the outcome: `stop()` returns the state to
    // `idle`, and a frame that could not be read has just set it to `failed` —
    // so calling it unconditionally left `data-capture-state="idle"` sitting
    // under an error saying the image could not be read. Branching on what
    // `take` reports rather than on `state.value`, which the compiler cannot
    // see through the await and would narrow to the value it had before it.
    if (read) stop()
    else releaseStream()
  }

  /** A file the user chose, which on a phone is a photograph they just took. */
  async function fromFile(file: Blob): Promise<void> {
    await take(file)
  }

  /** Whether a photograph came of it. */
  async function take(from: ImageBitmapSource): Promise<boolean> {
    if (reading.value) return false
    reading.value = true
    try {
      photo.value = await normalise(from)
      message.value = null
      return true
    } catch {
      // Deliberately not the decoded reason. `createImageBitmap` throws the same
      // `InvalidStateError` for a corrupt file, an unsupported codec and a
      // format this browser happens not to build with, and guessing between them
      // in front of a user is worse than saying what is certain.
      photo.value = null
      state.value = 'failed'
      message.value = 'That image could not be read. A JPEG or PNG photograph works best.'
      return false
    } finally {
      reading.value = false
    }
  }

  function discard(): void {
    photo.value = null
    message.value = null
  }

  onUnmounted(stop)

  return {
    state: readonly(state),
    message: readonly(message),
    photo: readonly(photo),
    reading: readonly(reading),
    start,
    stop,
    capture,
    fromFile,
    discard,
  }
}

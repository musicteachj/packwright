/**
 * The scan path, without a camera.
 *
 * jsdom has neither `getUserMedia` nor `BarcodeDetector`, which is why both are
 * injected. What is worth testing here is not the camera but what happens to a
 * value once it is read, and what is said when there is no value at all — a
 * refusal, a declined permission, a browser that offers nothing. Those are the
 * states a browser test cannot drive: Chromium's permission prompt is a dialog no
 * test can click, which is why the e2e runs with `--use-fake-ui-for-media-stream`.
 */

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { NATIVE_TRIAL_MS, useBarcodeScanner } from './useBarcodeScanner'
import type { DetectedSymbol, SelectedDetector } from './detector'
import type { ScannerOptions } from './useBarcodeScanner'

/** A detector that reports whatever it is told to, as many times as asked. */
const detectorReading = (symbols: readonly DetectedSymbol[]): (() => Promise<SelectedDetector>) => {
  return () =>
    Promise.resolve({ engine: 'zxing', detector: { detect: () => Promise.resolve(symbols) } })
}

const aStream = () => ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream

/** Comfortably more than one tick, so an assertion never lands mid-interval. */
const INTERVAL_SLACK_MS = 500

/**
 * Mounts the composable in a real component, because it registers `onUnmounted`
 * and a scanner that never releases the camera is the defect most worth catching.
 */
function mountScanner(options: Omit<ScannerOptions, 'video'>) {
  const harness = defineComponent({
    setup() {
      const video = ref<HTMLVideoElement | null>(null)
      const scanner = useBarcodeScanner({ ...options, video })
      // A video element that reports a decodable frame.
      video.value = {
        readyState: 4,
        play: () => Promise.resolve(),
        srcObject: null,
      } as unknown as HTMLVideoElement
      return { scanner }
    },
    render: () => h('div'),
  })
  return mount(harness)
}

describe('starting the camera', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('reports a declined permission as a decision, not a fault', async () => {
    // `NotAllowedError` is someone pressing Block. Telling them to check their
    // browser settings when they made a choice is how a tool loses trust.
    const denied = Object.assign(new Error('no'), { name: 'NotAllowedError' })
    const wrapper = mountScanner({
      detectorFactory: detectorReading([]),
      getMedia: () => Promise.reject(denied),
      onRead: vi.fn(),
    })

    await wrapper.vm.scanner.start()

    expect(wrapper.vm.scanner.state.value).toBe('denied')
    expect(wrapper.vm.scanner.message.value).toMatch(/declined/i)
    expect(wrapper.vm.scanner.message.value, 'and it offers the way round it').toMatch(
      /typed or pasted/i,
    )
  })

  it('distinguishes a missing camera from a refused one', async () => {
    const wrapper = mountScanner({
      detectorFactory: detectorReading([]),
      getMedia: () => Promise.reject(new Error('none')),
      onRead: vi.fn(),
    })

    await wrapper.vm.scanner.start()

    expect(wrapper.vm.scanner.state.value).toBe('failed')
    expect(wrapper.vm.scanner.message.value).not.toMatch(/declined/i)
  })
})

describe('reading a symbol', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('hands the raw value on without interpreting it', async () => {
    // The scanner decides nothing about what may become a GTIN-12. It passes the
    // symbol value along, and `normaliseScannedGtin` is the only thing permitted
    // to narrow or refuse it.
    const onRead = vi.fn()
    const wrapper = mountScanner({
      detectorFactory: detectorReading([{ rawValue: '0036000291452', format: 'ean_13' }]),
      getMedia: () => Promise.resolve(aStream()),
      onRead,
    })

    await wrapper.vm.scanner.start()
    await vi.waitUntil(() => onRead.mock.calls.length > 0, { timeout: 2000 })

    expect(onRead).toHaveBeenCalledWith('0036000291452', 'ean_13')
  })
})

describe('stopping', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('stops the camera tracks rather than dropping the stream', async () => {
    // A `MediaStream` dropped on the floor leaves the camera light on until
    // garbage collection, which reads to the person holding the phone as an
    // application still watching them.
    const stop = vi.fn()
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream

    const wrapper = mountScanner({
      detectorFactory: detectorReading([]),
      getMedia: () => Promise.resolve(stream),
      onRead: vi.fn(),
    })

    await wrapper.vm.scanner.start()
    expect(wrapper.vm.scanner.state.value).toBe('scanning')

    wrapper.vm.scanner.stop()
    expect(stop).toHaveBeenCalled()
    expect(wrapper.vm.scanner.state.value).toBe('idle')
  })

  it('releases the camera when the component goes away', async () => {
    const stop = vi.fn()
    const wrapper = mountScanner({
      detectorFactory: detectorReading([]),
      getMedia: () => Promise.resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream),
      onRead: vi.fn(),
    })

    await wrapper.vm.scanner.start()
    wrapper.unmount()

    expect(stop, 'unmounting must not leave the camera running').toHaveBeenCalled()
  })
})

/**
 * The browser's own detector is trusted only as far as it reads.
 *
 * Asserted here rather than in a browser, because which engine a browser starts
 * with is decided by the operating system: Chromium exposes `BarcodeDetector` on
 * macOS, Android and ChromeOS and not on Linux. A browser test asserting the
 * fallback passes on a Mac and times out on CI.
 */
describe('when the native detector reports support and reads nothing', () => {
  // The clock is faked so the window can be walked to its edges. Waited out in
  // real time it is eight seconds per assertion, and the last version of these
  // tests slept a fixed five against a window that had moved to eight.
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  /** Native that always comes back empty — headless Chromium's actual behaviour. */
  const barrenNative = (): Promise<SelectedDetector> =>
    Promise.resolve({ engine: 'native', detector: { detect: () => Promise.resolve([]) } })

  it('hands the frames to zxing, and reads what native could not', async () => {
    const onRead = vi.fn()
    const wrapper = mountScanner({
      detectorFactory: barrenNative,
      getMedia: () => Promise.resolve(aStream()),
      onRead,
      // Injected so the swap does not reach for the real ponyfill, which would
      // load a megabyte of WebAssembly into jsdom to prove a branch.
      zxingFactory: detectorReading([{ rawValue: '0036000291452', format: 'ean_13' }]),
    })

    await wrapper.vm.scanner.start()
    await vi.advanceTimersByTimeAsync(NATIVE_TRIAL_MS + INTERVAL_SLACK_MS)

    expect(onRead).toHaveBeenCalledWith('0036000291452', 'ean_13')
    expect(wrapper.vm.scanner.engine.value, 'and it says which engine read it').toBe('zxing')
  })

  it('counts a frame that throws as a frame that read nothing', async () => {
    // A detector that rejects every frame is what Chromium does when the
    // platform's barcode service is unavailable. It has read nothing, exactly as
    // an empty result reads nothing, and the trial window exists to rescue
    // precisely this — so a rejection has to count towards it. Swallowed on its
    // own the counter stays at zero for ever, and the scanner sits on a detector
    // that cannot read with no window left to save it.
    const throwingNative = (): Promise<SelectedDetector> =>
      Promise.resolve({
        engine: 'native',
        detector: {
          detect: () => Promise.reject(new Error('barcode detection service unavailable')),
        },
      })

    const onRead = vi.fn()
    const wrapper = mountScanner({
      detectorFactory: throwingNative,
      getMedia: () => Promise.resolve(aStream()),
      onRead,
      zxingFactory: detectorReading([{ rawValue: '0036000291452', format: 'ean_13' }]),
    })

    await wrapper.vm.scanner.start()
    await vi.advanceTimersByTimeAsync(NATIVE_TRIAL_MS + INTERVAL_SLACK_MS)

    expect(
      wrapper.vm.scanner.engine.value,
      'a detector that throws on every frame must still lose the camera',
    ).toBe('zxing')
    expect(onRead).toHaveBeenCalledWith('0036000291452', 'ean_13')
  })

  it('keeps the platform detector until the whole window has gone barren', async () => {
    // A barren frame is usually just aiming. Swapping early trades a working
    // platform decoder for wasm on the main thread because the user was slow,
    // so the near edge of the window is asserted as well as the far one.
    const wrapper = mountScanner({
      detectorFactory: barrenNative,
      getMedia: () => Promise.resolve(aStream()),
      onRead: vi.fn(),
      zxingFactory: detectorReading([]),
    })

    await wrapper.vm.scanner.start()
    expect(wrapper.vm.scanner.engine.value, 'the premise: it starts on native').toBe('native')

    await vi.advanceTimersByTimeAsync(NATIVE_TRIAL_MS - INTERVAL_SLACK_MS)
    expect(wrapper.vm.scanner.engine.value, 'still aiming, as far as anyone knows').toBe('native')

    await vi.advanceTimersByTimeAsync(INTERVAL_SLACK_MS * 2)
    // **The swap is unconditional, and this says so.** zxing read nothing either
    // and the frames go to it regardless: sixty-four barren frames is the whole
    // evidence the counter has. Offering zxing the frame native failed on and
    // swapping only if it reads is the sharper shape, and it is in
    // `docs/BACKLOG.md` rather than here. The test this replaced claimed that
    // behaviour and passed only by never reaching the swap.
    expect(wrapper.vm.scanner.engine.value, 'the window closed, so the frames move').toBe('zxing')
  })
})

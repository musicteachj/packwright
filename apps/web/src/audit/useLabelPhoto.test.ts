import { mount } from '@vue/test-utils'
import { defineComponent, h, ref, type ShallowRef } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useLabelPhoto, type LabelPhotoOptions } from './useLabelPhoto'
import type { PhotoPipeline } from './normalisePhoto'

const pipeline = (): PhotoPipeline => ({
  decode: async () => ({ width: 1200, height: 900 }),
  encode: async () => new Uint8Array([1, 2, 3]),
})

const fakeStream = () => {
  const stop = vi.fn()
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream
  return { stream, stop }
}

const failing = (name: string) =>
  vi.fn().mockRejectedValue(Object.assign(new Error(name), { name }))

/**
 * Mounted in a real component, because the composable registers `onUnmounted`
 * and a capture screen that never releases the camera is the defect most worth
 * catching. The same reason `useBarcodeScanner.test.ts` gives.
 */
function mountPhoto(options: Omit<LabelPhotoOptions, 'video'>) {
  const captured: { photo?: ReturnType<typeof useLabelPhoto> } = {}
  const harness = defineComponent({
    setup() {
      const video = ref<HTMLVideoElement | null>(null)
      captured.photo = useLabelPhoto({
        ...options,
        video: video as Readonly<ShallowRef<HTMLVideoElement | null>>,
      })
      video.value = {
        srcObject: null,
        play: () => Promise.resolve(),
      } as unknown as HTMLVideoElement
      return {}
    },
    render: () => h('div'),
  })
  const wrapper = mount(harness)
  return { wrapper, photo: captured.photo! }
}

describe('choosing a file', () => {
  it('needs no camera at all', async () => {
    // The primary path, and the one that has to work when the camera does not.
    const { photo } = mountPhoto({ pipeline: pipeline(), getMedia: failing('NotAllowedError') })
    await photo.fromFile(new Blob())
    expect(photo.photo.value?.mediaType).toBe('image/jpeg')
    expect(photo.state.value).toBe('idle')
  })

  it('reports an image it cannot read without leaving the last one on screen', async () => {
    const broken: PhotoPipeline = {
      decode: vi.fn().mockRejectedValue(new DOMException('bad', 'InvalidStateError')),
      encode: async () => new Uint8Array(),
    }
    const { photo } = mountPhoto({ pipeline: broken })
    await photo.fromFile(new Blob())
    expect(photo.photo.value).toBeNull()
    expect(photo.state.value).toBe('failed')
    expect(photo.message.value).toContain('could not be read')
  })

  it('ignores a second file while the first is still being read', async () => {
    let release: (() => void) | undefined
    const slow: PhotoPipeline = {
      decode: () =>
        new Promise((resolve) => {
          release = () => resolve({ width: 100, height: 100 })
        }),
      encode: async () => new Uint8Array([1]),
    }
    const { photo } = mountPhoto({ pipeline: slow })

    const first = photo.fromFile(new Blob())
    const second = photo.fromFile(new Blob())
    expect(photo.reading.value).toBe(true)
    release?.()
    await Promise.all([first, second])
    expect(photo.photo.value).not.toBeNull()
  })
})

describe('the camera', () => {
  it('reports a declined permission as a decision, not a fault', async () => {
    // And says what to do instead, because the file input is still there.
    const { photo } = mountPhoto({ getMedia: failing('NotAllowedError'), pipeline: pipeline() })
    await photo.start()
    expect(photo.state.value).toBe('denied')
    expect(photo.message.value).toContain('declined')
    expect(photo.message.value).toContain('file')
  })

  it('separates a browser that cannot from a person who said no', async () => {
    const { photo } = mountPhoto({ getMedia: failing('NotSupportedError'), pipeline: pipeline() })
    await photo.start()
    expect(photo.state.value).toBe('unsupported')
  })

  it('takes the frame and then lets the camera go', async () => {
    // A camera left running behind a still photograph is a light on a phone for
    // no reason.
    const { stream, stop } = fakeStream()
    const { photo } = mountPhoto({
      getMedia: vi.fn().mockResolvedValue(stream),
      pipeline: pipeline(),
    })
    await photo.start()
    expect(photo.state.value).toBe('previewing')

    await photo.capture()
    expect(photo.photo.value).not.toBeNull()
    expect(stop).toHaveBeenCalled()
    expect(photo.state.value).toBe('idle')
  })

  it('releases a stream granted after the screen gave up waiting for it', async () => {
    // `getUserMedia` is a prompt and takes as long as the user does. A grant
    // that arrives after `stop` is a camera nothing holds a reference to.
    const { stream, stop } = fakeStream()
    let grant: ((value: MediaStream) => void) | undefined
    const { photo } = mountPhoto({
      getMedia: () =>
        new Promise<MediaStream>((resolve) => {
          grant = resolve
        }),
      pipeline: pipeline(),
    })

    const starting = photo.start()
    photo.stop()
    grant?.(stream)
    await starting

    expect(stop).toHaveBeenCalled()
    expect(photo.state.value).toBe('idle')
  })

  it('releases the camera when the screen goes away', async () => {
    const { stream, stop } = fakeStream()
    const { wrapper, photo } = mountPhoto({
      getMedia: vi.fn().mockResolvedValue(stream),
      pipeline: pipeline(),
    })
    await photo.start()
    wrapper.unmount()
    expect(stop).toHaveBeenCalled()
  })

  it('does not report a frame it could not read as an idle camera', async () => {
    // `stop()` returns the state to `idle`, and a frame that could not be read
    // has just set it to `failed`. Calling it unconditionally left the screen
    // saying `idle` under an error message saying the image could not be read.
    const { stream, stop } = fakeStream()
    const broken: PhotoPipeline = {
      decode: vi.fn().mockRejectedValue(new DOMException('bad', 'InvalidStateError')),
      encode: async () => new Uint8Array(),
    }
    const { photo } = mountPhoto({ getMedia: vi.fn().mockResolvedValue(stream), pipeline: broken })
    await photo.start()
    await photo.capture()

    expect(photo.state.value).toBe('failed')
    expect(photo.message.value).toContain('could not be read')
    // And the camera is still let go, which is the other half.
    expect(stop).toHaveBeenCalled()
  })

  it('does not capture when there is nothing to capture from', async () => {
    const { photo } = mountPhoto({ getMedia: failing('NotAllowedError'), pipeline: pipeline() })
    await photo.capture()
    expect(photo.photo.value).toBeNull()
  })
})

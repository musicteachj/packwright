import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuditView from './AuditView.vue'
import { testRouter } from './editorTestRouter'

/**
 * The encode path is stubbed, not the reading.
 *
 * jsdom has neither `createImageBitmap` nor a canvas that draws, so a real
 * `normalisePhoto` fails here for reasons that have nothing to do with this
 * screen. The arithmetic it does is tested directly in `normalisePhoto.test.ts`;
 * what these tests are for is what happens to a reading once it exists.
 */
vi.mock('../audit/normalisePhoto', async (original) => ({
  ...(await original<typeof import('../audit/normalisePhoto')>()),
  normalisePhoto: vi.fn(async () => ({
    mediaType: 'image/jpeg' as const,
    data: 'AAAA',
    widthPx: 1200,
    heightPx: 900,
  })),
}))

const READING = {
  extraction: {
    fields: {
      productIdentifier: { value: 'Acetone', confidence: 0.99 },
      signalWords: { value: ['Danger', 'Warning'], confidence: 0.98 },
      hazardStatementCodes: { value: ['H225', 'H999'], confidence: 0.9 },
    },
    warnings: [],
  },
  model: 'claude-opus-5',
}

const respond = (body: unknown, ok = true, status = 200) =>
  vi.fn().mockResolvedValue({ ok, status, json: async () => body } as unknown as Response)

async function mountAudit(body: unknown = READING, ok = true, status = 200) {
  vi.stubGlobal('fetch', respond(body, ok, status))
  const wrapper = mount(AuditView, {
    global: { plugins: [testRouter('/audit')], stubs: { RouterLink: true } },
  })
  await flushPromises()
  return wrapper
}

/** Chooses a market and a photograph, then asks the server to read it. */
async function readALabel(wrapper: Awaited<ReturnType<typeof mountAudit>>) {
  await wrapper.find('[data-test="regime"]').setValue('eu-clp')
  await wrapper.vm.$nextTick()
  const input = wrapper.find('[data-test="photo-file"]')
  Object.defineProperty(input.element, 'files', { value: [new Blob()], configurable: true })
  await input.trigger('change')
  await flushPromises()
  await wrapper.find('[data-test="read"]').trigger('click')
  await flushPromises()
  return wrapper
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe('before anything has been read', () => {
  it('will not ask the server without a market chosen', async () => {
    const wrapper = await mountAudit()
    expect(wrapper.find('[data-test="read"]').attributes('disabled')).toBeDefined()
  })

  it('offers no market by default, because choosing one is the point', async () => {
    // It selects which rules apply and which wording is correct. A default is a
    // label silently judged against the wrong regulator.
    const wrapper = await mountAudit()
    expect((wrapper.find('[data-test="regime"]').element as HTMLSelectElement).value).toBe('')
  })
})

describe('the photograph on screen', () => {
  it('is shown, not merely announced', async () => {
    // The readings are a claim about a label. Checking a claim against a label
    // you cannot see is not checking it — which only became obvious on seeing
    // this screen in a browser.
    const wrapper = await readALabel(await mountAudit())
    const preview = wrapper.find('[data-test="photo-preview"]')
    expect(preview.exists()).toBe(true)
    expect(preview.attributes('src')).toContain('data:image/jpeg;base64,')
    expect(preview.attributes('alt')).not.toBe('')
  })
})

describe('what the photograph showed', () => {
  it('accepts nothing on the user behalf', async () => {
    const wrapper = await readALabel(await mountAudit())

    // The premise first: the reading really did arrive and really does carry
    // this field. Without it, an empty document would pass for the right reason
    // by accident.
    expect(wrapper.find('[data-value="productIdentifier"]').text()).toBe('Acetone')
    expect(wrapper.find('[data-field="productIdentifier"]').attributes('data-accepted')).toBe(
      'false',
    )
    expect(wrapper.find('[data-test="nothing-confirmed"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="document"]').exists()).toBe(false)
  })

  it('puts a field into the document only once it is accepted', async () => {
    const wrapper = await readALabel(await mountAudit())
    await wrapper.find('[data-test="accept-productIdentifier"]').trigger('click')

    expect(wrapper.find('[data-test="document"]').text()).toContain('Acetone')
    // And still only that one — accepting one field must not sweep the rest in.
    expect(wrapper.find('[data-test="document"]').text()).not.toContain('Danger')
  })

  it('lets an acceptance be taken back', async () => {
    const wrapper = await readALabel(await mountAudit())
    const accept = wrapper.find('[data-test="accept-productIdentifier"]')
    await accept.trigger('click')
    await accept.trigger('click')
    expect(wrapper.find('[data-test="nothing-confirmed"]').exists()).toBe(true)
  })

  it('un-accepts a field that is edited after it was accepted', async () => {
    // What was agreed to was the value on screen at the time. Carrying the
    // acceptance across an edit would let a value nobody looked at into the
    // document.
    const wrapper = await readALabel(await mountAudit())
    await wrapper.find('[data-test="accept-productIdentifier"]').trigger('click')
    expect(wrapper.find('[data-test="document"]').text()).toContain('Acetone')

    await wrapper.findAll('[data-field="productIdentifier"] button')[1]!.trigger('click')
    await wrapper.find('[data-test="edit-productIdentifier"]').setValue('Propan-2-one')

    expect(wrapper.find('[data-field="productIdentifier"]').attributes('data-accepted')).toBe(
      'false',
    )
    expect(wrapper.find('[data-test="document"]').exists()).toBe(false)
  })

  it('confirms the edited value rather than the one that was read', async () => {
    const wrapper = await readALabel(await mountAudit())
    await wrapper.findAll('[data-field="productIdentifier"] button')[1]!.trigger('click')
    await wrapper.find('[data-test="edit-productIdentifier"]').setValue('Propan-2-one')
    await wrapper.find('[data-test="accept-productIdentifier"]').trigger('click')

    expect(wrapper.find('[data-test="document"]').text()).toContain('Propan-2-one')
    expect(wrapper.find('[data-test="document"]').text()).not.toContain('Acetone')
  })

  it('removes a discarded field from the screen entirely', async () => {
    const wrapper = await readALabel(await mountAudit())
    await wrapper.find('[data-test="discard-signalWords"]').trigger('click')
    expect(wrapper.find('[data-field="signalWords"]').exists()).toBe(false)
  })
})

describe('a statement code this build cannot carry', () => {
  it('is shown, because it really was on the label', async () => {
    const wrapper = await readALabel(await mountAudit())
    expect(wrapper.find('[data-unusable="hazardStatementCodes"]').text()).toContain('H999')
  })

  it('is left out of the document when the field is accepted', async () => {
    // `GhsRequest` admits only codes with verified text, so confirming H999
    // would produce a label the save and export routes refuse outright — with a
    // 400 naming a field the user cannot edit their way out of.
    const wrapper = await readALabel(await mountAudit())
    await wrapper.find('[data-test="accept-hazardStatementCodes"]').trigger('click')

    const document = wrapper.find('[data-test="document"]').text()
    expect(document).toContain('H225')
    expect(document).not.toContain('H999')
  })
})

describe('what the photograph cannot show', () => {
  it('fills in none of it', async () => {
    // `DEFAULT_GHS_STOCK` is 74 x 105 mm, the CLP minimum for the three-to-fifty
    // litre band. Defaulting it would hand `ghs/label-dimensions` a guaranteed
    // pass on a label nobody measured.
    const wrapper = await readALabel(await mountAudit())
    for (const field of ['capacity', 'width', 'height']) {
      expect((wrapper.find(`[data-test="${field}"]`).element as HTMLInputElement).value).toBe('')
    }
  })

  it('names what is still missing rather than counting it', async () => {
    const wrapper = await readALabel(await mountAudit())
    const missing = wrapper.find('[data-test="missing"]').text()
    expect(missing).toContain('the package capacity')
    expect(missing).toContain('the measured label size')
    expect(missing).toContain('a confirmed product identifier')
  })

  it('stops naming a gap once it is filled', async () => {
    const wrapper = await readALabel(await mountAudit())
    await wrapper.find('[data-test="capacity"]').setValue('1')
    expect(wrapper.find('[data-test="missing"]').text()).not.toContain('the package capacity')
  })
})

describe('a second photograph', () => {
  it('puts the first reading away rather than leaving it under a new picture', async () => {
    // Otherwise the rows from photo A stay on screen, and stay acceptable,
    // captioned by a preview of photo B — so somebody could accept a reading of
    // one label while looking at another.
    const wrapper = await readALabel(await mountAudit())
    expect(wrapper.find('[data-field="productIdentifier"]').exists()).toBe(true)

    const input = wrapper.find('[data-test="photo-file"]')
    Object.defineProperty(input.element, 'files', { value: [new Blob()], configurable: true })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.find('[data-field="productIdentifier"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="document"]').exists()).toBe(false)
  })

  it('can be the same file twice', async () => {
    // A real browser fires no `change` when the same file is re-chosen unless
    // the input's value has been cleared, so discarding a photograph and picking
    // that same file again did nothing at all — no event, no error, no
    // photograph.
    //
    // The assignment is watched rather than the value read back. jsdom reports
    // a file input's `value` as `''` whatever happens, so reading it asserts
    // nothing: the first version of this test passed against the code with the
    // clearing deleted.
    const wrapper = await mountAudit()
    const input = wrapper.find('[data-test="photo-file"]')
    const cleared = vi.fn()
    Object.defineProperty(input.element, 'files', { value: [new Blob()], configurable: true })
    Object.defineProperty(input.element, 'value', {
      configurable: true,
      get: () => '',
      set: cleared,
    })

    await input.trigger('change')
    await flushPromises()
    expect(cleared).toHaveBeenCalledWith('')
  })
})

describe('a reading still in flight', () => {
  it('does not land on a photograph nobody asked about', async () => {
    // `read()` takes a while, and the photograph, the market and the discard
    // button are all reachable while it does. Without a generation guard the
    // reading of photo A arrived after the watcher had cleared the screen for
    // photo B, repopulating the rows under a preview of a different label —
    // exactly what that watcher exists to prevent.
    let answer: ((value: unknown) => void) | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise((resolve) => {
          answer = () => resolve({ ok: true, status: 200, json: async () => READING } as Response)
        }),
      ),
    )
    const wrapper = mount(AuditView, {
      global: { plugins: [testRouter('/audit')], stubs: { RouterLink: true } },
    })
    await flushPromises()
    await wrapper.find('[data-test="regime"]').setValue('eu-clp')
    const input = wrapper.find('[data-test="photo-file"]')
    Object.defineProperty(input.element, 'files', { value: [new Blob()], configurable: true })
    await input.trigger('change')
    await flushPromises()

    await wrapper.find('[data-test="read"]').trigger('click')
    // A second photograph arrives before the first reading comes back.
    await input.trigger('change')
    await flushPromises()

    answer?.(undefined)
    await flushPromises()

    expect(wrapper.find('[data-field="productIdentifier"]').exists()).toBe(false)
  })
})

describe('a measurement that is not one', () => {
  it('does not count as having been supplied', async () => {
    // `Number.parseFloat` reads `12mm abc` as 12 and `0` as a size, so a gap
    // the screen exists to name stopped being named on the strength of a typo.
    const wrapper = await readALabel(await mountAudit())
    await wrapper.find('[data-test="width"]').setValue('12mm abc')
    await wrapper.find('[data-test="height"]').setValue('0')
    expect(wrapper.find('[data-test="missing"]').text()).toContain('the measured label size')

    await wrapper.find('[data-test="capacity"]').setValue('-1')
    expect(wrapper.find('[data-test="missing"]').text()).toContain('the package capacity')
  })

  it('counts once it is a real one', async () => {
    const wrapper = await readALabel(await mountAudit())
    await wrapper.find('[data-test="width"]').setValue('74')
    await wrapper.find('[data-test="height"]').setValue('105')
    expect(wrapper.find('[data-test="missing"]').text()).not.toContain('the measured label size')
  })
})

describe('an edited list', () => {
  it('cannot smuggle a code past the closed set it belongs to', async () => {
    // Straight from the server these are validated already; edited, they were
    // not. `GHS99` confirmed into the document, where `isPictogramRecognised`
    // would have refused it and `GhsRequest` would have refused the label.
    const wrapper = await readALabel(await mountAudit())
    await wrapper.findAll('[data-field="hazardStatementCodes"] button')[1]!.trigger('click')
    await wrapper.find('[data-test="edit-hazardStatementCodes"]').setValue('H225, NOT-A-CODE')
    await wrapper.find('[data-test="accept-hazardStatementCodes"]').trigger('click')

    const shown = wrapper.find('[data-test="document"]').text()
    expect(shown).toContain('H225')
    expect(shown).not.toContain('NOT-A-CODE')
    expect(wrapper.find('[data-unusable="hazardStatementCodes"]').text()).toContain('NOT-A-CODE')
  })
})

describe('an edited value on its way into the document', () => {
  it('is stored in the spelling the engine looks up', async () => {
    // Through the screen, not through `partitionEntries`. The first version of
    // this took the raw parse whenever nothing was unusable, so an edited
    // `h225` was confirmed verbatim and the engine — which looks these up by
    // exact key — drew nothing. The test that should have caught it called the
    // partitioner directly and never came through here.
    const wrapper = await readALabel(await mountAudit())
    await wrapper.findAll('[data-field="hazardStatementCodes"] button')[1]!.trigger('click')
    // Two *hazard* codes, both usable once case is folded. The first version of
    // this test used `p337+p313` — a precautionary code in the hazard field, so
    // it was unusable, the partitioned branch ran, and the bypass this test
    // exists for was never reached. It passed against the bug.
    await wrapper.find('[data-test="edit-hazardStatementCodes"]').setValue('h225, h319')
    expect(wrapper.find('[data-unusable="hazardStatementCodes"]').exists()).toBe(false)

    await wrapper.find('[data-test="accept-hazardStatementCodes"]').trigger('click')
    const shown = wrapper.find('[data-test="document"]').text()
    expect(shown).toContain('H225, H319')
    expect(shown).not.toContain('h225')
  })

  it('cannot be accepted when there would be nothing to accept', async () => {
    // A supplier with only a name parses to nothing. The button used to take
    // the click, record the acceptance and contribute nothing, with no way to
    // tell that from a field that had worked.
    const wrapper = await readALabel(await mountAudit())
    await wrapper.findAll('[data-field="productIdentifier"] button')[1]!.trigger('click')
    await wrapper.find('[data-test="edit-productIdentifier"]').setValue('   ')

    expect(
      wrapper.find('[data-test="accept-productIdentifier"]').attributes('disabled'),
    ).toBeDefined()
  })

  it('stops carrying a confidence the model never gave it', async () => {
    // A confidence is the model's account of how clearly it read something.
    // Over an edit it becomes a number about text the model never saw, sitting
    // beside it as though it still meant something.
    const wrapper = await readALabel(await mountAudit())
    expect(wrapper.find('[data-field="productIdentifier"]').text()).toContain('confidence 0.99')

    await wrapper.findAll('[data-field="productIdentifier"] button')[1]!.trigger('click')
    await wrapper.find('[data-test="edit-productIdentifier"]').setValue('Propan-2-one')

    const row = wrapper.find('[data-field="productIdentifier"]').text()
    expect(row).not.toContain('confidence')
    expect(row).toContain('edited')
  })
})

describe('changing the market after a reading', () => {
  it('puts the reading away, because it was made under the old one', async () => {
    // The regime is sent with the request, so a reading belongs to the market
    // it was made under. Keeping it meant a us-osha reading re-judged under
    // CLP — and `chosenRegime` falls back to `eu-clp`, so merely returning the
    // select to "Choose a market" did it too.
    const wrapper = await readALabel(await mountAudit())
    expect(wrapper.find('[data-field="productIdentifier"]').exists()).toBe(true)

    await wrapper.find('[data-test="regime"]').setValue('us-osha')
    expect(wrapper.find('[data-field="productIdentifier"]').exists()).toBe(false)
  })
})

describe('when the server refuses', () => {
  it('says what the server said, rather than a status', async () => {
    const wrapper = await readALabel(
      await mountAudit(
        { error: 'Reading this image was declined', detail: ['No reason was given.'] },
        false,
        422,
      ),
    )
    const alert = wrapper.find('[role="alert"]')
    expect(alert.text()).toContain('Reading this image was declined')
    expect(alert.text()).toContain('No reason was given.')
  })

  it('shows no rows to accept when there was no reading', async () => {
    const wrapper = await readALabel(
      await mountAudit({ error: 'Vision extraction is not configured' }, false, 503),
    )
    expect(wrapper.find('[data-field="productIdentifier"]').exists()).toBe(false)
  })
})

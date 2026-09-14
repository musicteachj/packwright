# Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store, list, read, replace and delete saved labels through `/api/labels`, with Zod as the single source of truth for a label's shape.

**Architecture:** The Zod schemas that today live inside `apps/api/src/labels/routes.ts` move to a shared `schemas.ts` and gain one composite, `LabelDocumentInput`. A Mongoose model stores `data` as `Mixed` and lets Zod judge it, on the way in and on the way back out. `MONGODB_URI` becomes required, so the process refuses to boot without a database rather than reporting healthy and failing under traffic.

**Tech Stack:** Express 5, Mongoose 9, Zod 4, Vitest, supertest, mongodb-memory-server, Playwright.

**Source spec:** `docs/specs/2026-09-14-persistence-design.md`

---

## Two PRs, not one

**PR A is Task 1 alone** — moving the schemas out of `routes.ts`. It changes no behaviour, and its proof is that
every existing test passes untouched. That property is worth reviewing on its own rather than buried inside a
feature.

**PR B is Tasks 2–8.** Roughly 1,100 lines, which sits under the ~1,500 trigger in `CLAUDE.md`.

Run `/code-review medium` with no target before each commit, per the review ladder.

---

## File structure

| file | responsibility |
|---|---|
| `apps/api/src/labels/schemas.ts` | **new.** Every Zod shape and every `toX` mapper. Imported by both routers. |
| `apps/api/src/labels/routes.ts` | **modified.** Export routes only; imports its schemas. |
| `apps/api/src/labels/labelDocument.ts` | **new.** The Mongoose model and its serializer. |
| `apps/api/src/labels/labelDocumentRoutes.ts` | **new.** The five CRUD routes. |
| `apps/api/src/db.ts` | **new.** Connect, disconnect, report status. |
| `apps/api/src/env.ts` | **modified.** `MONGODB_URI` becomes required. |
| `apps/api/src/app.ts` | **modified.** Mounts the CRUD router; `/health` reports injected database status. |
| `apps/api/src/server.ts` | **modified.** Connects before listening. |
| `apps/api/src/testing/withDatabase.ts` | **new.** `mongodb-memory-server` lifecycle for tests. |
| `playwright.config.ts` | **modified.** Starts a Mongo for the browser suite. |
| `docker-compose.yml` | **new.** A mongo service for local development. |

### Two facts that constrain the design

**`/api/labels/:id` does not collide with `/api/labels/upc-a/export`.** The first matches one path segment, the
second is two segments and POST-only. Both routers can mount on `/api/labels`.

**`/health` must receive the database status, not import mongoose.** `createApp`'s docblock already settles
this for `webRoot`: "Passed in rather than resolved here, so that `createApp()` builds the same application
every time it is called." Importing mongoose into `app.ts` would make all fifteen existing route tests depend
on a connection.

---

## Task 1: Extract the schemas — PR A

**Files:**

- Create: `apps/api/src/labels/schemas.ts`
- Modify: `apps/api/src/labels/routes.ts`

A pure move. Nothing is rewritten, renamed or "improved" on the way.

- [ ] **Step 1: Create `schemas.ts` and move these declarations into it, unchanged**

Move, in this order, from `apps/api/src/labels/routes.ts`:

| lines | name |
|---|---|
| 68–70 | `UPC_A_CONSTRAINTS`, `GTIN_LENGTH` |
| 72–83 | `Artwork` |
| 84–91 | `DigitalLink` |
| 92–125 | `UpcARequest` |
| 126–136 | `toArtwork` |
| 137–148 | `toDigitalLink` |
| 149–154 | `GhsSupplierSchema` |
| 155–193 | `GhsRequest` |
| 194–210 | `toSupplier` |
| 211–246 | `ContainerSchema` |
| 247–248 | `NON_COMPLIANT_BUT_WELL_FORMED` |
| 249–254 | `NetQuantitySchema` |
| 255–266 | `IngredientSchema` |
| 267–284 | `ResponsibleFirmSchema` |
| 285–300 | `toColumns` |
| 301–313 | `toIngredient` |
| 314–362 | `toNutritionFacts` |
| 363–383 | `toResponsibleFirm` |
| 384–385 | `NutrientAmounts` |
| 386–437 | `NutritionFactsSchema` |
| 438–494 | `UsFoodRequest` |
| 495–511 | `toNetQuantity` |
| 512–522 | `toContainer` |

Add `export` to each. Move the `label-core`, `zod` and `bwip-js` imports each one needs; leave
`renderLayoutToPdf`, `Router`, `Request` and `Response` behind in `routes.ts`.

Carry every docblock and inline comment across with its declaration. The comment on `toArtwork` about
`exactOptionalPropertyTypes`, and the one on `UpcARequest` about bounding magnification below only, are the
reasoning for the code they sit on — a move that leaves them behind is a move that loses them.

- [ ] **Step 2: Import them back into `routes.ts`**

```ts
import {
  GhsRequest,
  UpcARequest,
  UsFoodRequest,
  toArtwork,
  toColumns,
  toContainer,
  toDigitalLink,
  toIngredient,
  toNetQuantity,
  toNutritionFacts,
  toResponsibleFirm,
  toSupplier,
} from './schemas'
```

- [ ] **Step 3: Prove nothing changed**

```bash
npm test && npm run lint && npm run typecheck && npm run format:check
```

Expected: 46 test files, 918 tests, all passing. **No test file is edited in this task.** If a test needed
changing, the move was not a move.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/labels/schemas.ts apps/api/src/labels/routes.ts CHANGELOG.md
git commit
```

Update `CHANGELOG.md` in the same commit, per `CLAUDE.md`.

---

## Task 2: `MONGODB_URI` becomes required

**Files:**

- Modify: `apps/api/src/env.ts`
- Test: `apps/api/src/env.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/env.test.ts`:

```ts
it('refuses to start without a database URI', () => {
  // env.ts's own argument, applied: deferring a missing URI to the first request
  // that needs it means a task that reports healthy and then 500s under traffic.
  expect(() => loadEnv({ MONGODB_URI: undefined })).toThrow(/MONGODB_URI/)
})

it('treats a declared-but-blank URI as missing', () => {
  // An ECS task definition that declares the variable and leaves it empty is the
  // case `blankAsAbsent` exists for, and it must not survive becoming required.
  expect(() => loadEnv({ MONGODB_URI: '' })).toThrow(/MONGODB_URI/)
})

it('accepts a URI that is present', () => {
  expect(loadEnv({ MONGODB_URI: 'mongodb://localhost:27017/packwright' }).MONGODB_URI).toBe(
    'mongodb://localhost:27017/packwright',
  )
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx vitest run --project api src/env.test.ts
```

Expected: the first two FAIL — `MONGODB_URI` is currently optional, so `loadEnv` returns rather than throwing.

- [ ] **Step 3: Make it required**

In `apps/api/src/env.ts`, replace the `MONGODB_URI` line:

```ts
  /**
   * Required. The process refuses to boot without it.
   *
   * It was optional while there was nothing to store. Leaving it optional now
   * would mean a server that starts, reports healthy to the ALB, serves the
   * client, and answers every persistence route with a failure — which is the
   * exact shape this file's opening docblock refuses at startup. Injected from
   * Secrets Manager in production.
   */
  MONGODB_URI: blankAsAbsent(z.string().min(1)),
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npx vitest run --project api src/env.test.ts
```

Expected: PASS. Other `env.test.ts` cases that build an environment without `MONGODB_URI` now need one — add
`MONGODB_URI: 'mongodb://localhost:27017/test'` to their input rather than relaxing the schema.

- [ ] **Step 5: Commit**

---

## Task 3: The database connection

**Files:**

- Create: `apps/api/src/db.ts`
- Test: `apps/api/src/db.test.ts`
- Create: `apps/api/src/testing/withDatabase.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install `mongodb-memory-server`**

```bash
npx npm@11 install --workspace @packwright/api --save-dev mongodb-memory-server
```

- [ ] **Step 2: Write the test helper**

Create `apps/api/src/testing/withDatabase.ts`:

```ts
/**
 * A real MongoDB, started per test file.
 *
 * `mongodb-memory-server` runs an actual `mongod` against a temporary directory,
 * so the model is exercised by the database it will meet in production rather
 * than by a mock of it. A mocked Mongoose would prove the tests agree with
 * themselves — the questions worth asking here are whether the schema stores
 * what it claims and whether a document survives a round trip, and neither can
 * be answered without a server.
 */
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { afterAll, afterEach, beforeAll } from 'vitest'

export function withDatabase(): void {
  let server: MongoMemoryServer

  beforeAll(async () => {
    server = await MongoMemoryServer.create()
    await mongoose.connect(server.getUri())
  }, 60_000)

  // Between tests rather than between files. A collection left populated makes a
  // list assertion depend on which tests ran before it, which is how a suite
  // starts passing in one order and failing in another.
  afterEach(async () => {
    await mongoose.connection.db?.dropDatabase()
  })

  afterAll(async () => {
    await mongoose.disconnect()
    await server.stop()
  })
}
```

- [ ] **Step 3: Write the failing test for `db.ts`**

Create `apps/api/src/db.test.ts`:

The two states sit in separate `describe` blocks on purpose: tearing a connection down mid-file to observe the
teardown would leave every later test in that file without a database.

```ts
import { describe, expect, it } from 'vitest'
import { databaseStatus } from './db'
import { withDatabase } from './testing/withDatabase'

describe('databaseStatus with a connection', () => {
  withDatabase()

  it('reports a live connection as connected', () => {
    expect(databaseStatus()).toBe('connected')
  })
})

describe('databaseStatus without a connection', () => {
  // The state `/health` exists to notice. With MONGODB_URI required, a booted
  // server has a database; one lost afterwards is what an ALB needs told, and
  // `readyState` 0 is how mongoose says so.
  it('reports disconnected', () => {
    expect(databaseStatus()).toBe('disconnected')
  })
})
```

- [ ] **Step 4: Run it and watch it fail**

```bash
npx vitest run --project api src/db.test.ts
```

Expected: FAIL — `./db` does not exist.

- [ ] **Step 5: Write `db.ts`**

```ts
/**
 * The database connection, as a lifecycle the server owns.
 *
 * Separated from `app.ts` because `createApp` is built to be constructible
 * without any I/O — that is what lets fifteen route tests run with supertest and
 * no port. A connection opened inside it would make every one of them need a
 * database to answer a question about a PDF.
 */
import mongoose from 'mongoose'

export type DatabaseStatus = 'connected' | 'connecting' | 'disconnecting' | 'disconnected'

/** Mongoose's `readyState` is a number; this is what the numbers mean. */
const STATES: Record<number, DatabaseStatus> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
}

export async function connectToDatabase(uri: string): Promise<void> {
  await mongoose.connect(uri)
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect()
}

export function databaseStatus(): DatabaseStatus {
  return STATES[mongoose.connection.readyState] ?? 'disconnected'
}
```

- [ ] **Step 6: Run it and watch it pass, then commit**

```bash
npx vitest run --project api src/db.test.ts
```

---

## Task 4: `LabelDocumentInput`

**Files:**

- Modify: `apps/api/src/labels/schemas.ts`
- Test: `apps/api/src/labels/schemas.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/labels/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { LABEL_TYPES, LabelDocumentInput } from './schemas'

// From the engine's own default rather than three numbers typed here. A copy
// would keep passing after the default moved, leaving a fixture asserting
// against a stock the application no longer uses.
import { DEFAULT_UPC_A_STOCK } from '@packwright/label-core'
const STOCK = DEFAULT_UPC_A_STOCK

describe('LabelDocumentInput', () => {
  it('accepts a gs1-retail document', () => {
    const parsed = LabelDocumentInput.safeParse({
      name: 'Granola 340g',
      labelType: 'gs1-retail',
      stock: STOCK,
      data: { gtin: '036000291452' },
    })
    expect(parsed.success).toBe(true)
  })

  it('refuses a document whose data belongs to another label type', () => {
    // The failure a PATCH would let through: a us-food document still carrying a
    // gtin. The discriminated union is what makes that unrepresentable.
    const parsed = LabelDocumentInput.safeParse({
      name: 'Mismatched',
      labelType: 'us-food',
      stock: STOCK,
      data: { gtin: '036000291452' },
    })
    expect(parsed.success).toBe(false)
  })

  it('requires stock rather than defaulting it', () => {
    // A saved label records the stock it was designed at. Inheriting
    // DEFAULT_UPC_A_STOCK would mean changing that constant silently resizes
    // every label already stored, first visible in a PDF someone has printed.
    const parsed = LabelDocumentInput.safeParse({
      name: 'No stock',
      labelType: 'gs1-retail',
      data: { gtin: '036000291452' },
    })
    expect(parsed.success).toBe(false)
  })

  it('requires a name that is not blank', () => {
    const parsed = LabelDocumentInput.safeParse({
      name: '   ',
      labelType: 'gs1-retail',
      stock: STOCK,
      data: { gtin: '036000291452' },
    })
    expect(parsed.success).toBe(false)
  })

  it('names every label type the editor can produce', () => {
    expect([...LABEL_TYPES]).toEqual(['gs1-retail', 'ghs-chemical', 'us-food'])
  })
})
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run --project api src/labels/schemas.test.ts
```

Expected: FAIL — `LabelDocumentInput` is not exported.

- [ ] **Step 3: Add the composite to `schemas.ts`**

The three `*Request` schemas flatten `stock` alongside the label's fields. A saved document nests them, so
each label type's data schema is the request schema with `stock` removed:

```ts
/**
 * The label types the editor can produce, in one place.
 *
 * The model, the routes and the client's store all need this list. Declared here
 * because this file is already where the shape of a label is decided, and a
 * second copy is the drift `getSymbologyConstraints` was introduced to end.
 */
export const LABEL_TYPES = ['gs1-retail', 'ghs-chemical', 'us-food'] as const

export const StockSchema = z.object({
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  marginMm: z.number().min(0),
})

/**
 * A saved label, as it arrives and as it comes back out.
 *
 * Discriminated on `labelType`, so a document claiming to be `us-food` while
 * carrying a `gtin` cannot be represented — which is also why the routes replace
 * rather than merge. `stock` is required here and optional on the export
 * request: an export borrows a default for one PDF, a saved label records what
 * it was designed at.
 */
export const LabelDocumentInput = z.discriminatedUnion('labelType', [
  z.object({
    name: z.string().trim().min(1).max(120),
    labelType: z.literal('gs1-retail'),
    stock: StockSchema,
    data: UpcARequest.omit({ stock: true }),
  }),
  z.object({
    name: z.string().trim().min(1).max(120),
    labelType: z.literal('ghs-chemical'),
    stock: StockSchema,
    data: GhsRequest.omit({ stock: true }),
  }),
  z.object({
    name: z.string().trim().min(1).max(120),
    labelType: z.literal('us-food'),
    stock: StockSchema,
    data: UsFoodRequest.omit({ stock: true }),
  }),
])

export type LabelDocumentInput = z.infer<typeof LabelDocumentInput>
```

**`UsFoodRequest` needs splitting first.** It is built at line 438 as `z.object({...}).superRefine(...)`, and
`.omit()` does not exist on a refined schema. Name the base object and lift the refinement body into a shared
function, so both the export route and the union above can reach the unrefined shape:

```ts
// The object and its cross-field checks, separated. `.omit()` is an object
// method and a refined schema is no longer an object, so the saved-document
// union could not reach inside this without the split.
export const UsFoodRequestBase = z.object({
  // ...every field exactly as it is today...
})

// The existing refinement body, unchanged, named so that both the export
// request and the saved document get the same cross-field checks.
export const usFoodCrossFieldChecks = (value, context) => {
  // ...moved verbatim from the current `.superRefine` callback...
}

export const UsFoodRequest = UsFoodRequestBase.superRefine(usFoodCrossFieldChecks)
```

The `us-food` arm of `LabelDocumentInput` then reads:

```ts
    data: UsFoodRequestBase.omit({ stock: true }).superRefine(usFoodCrossFieldChecks),
```

Applying the refinement on both sides matters. Omitting it would leave a saved us-food document validated more
weakly than the same label sent to the export route — the two disagreeing about what a valid label is, which
is the condition this architecture exists to prevent.

- [ ] **Step 4: Run and watch it pass, then commit**

---

## Task 5: The model

**Files:**

- Create: `apps/api/src/labels/labelDocument.ts`
- Test: `apps/api/src/labels/labelDocument.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_UPC_A_STOCK } from '@packwright/label-core'
import { LabelDocument, serializeLabelDocument } from './labelDocument'
import { withDatabase } from '../testing/withDatabase'

const STOCK = DEFAULT_UPC_A_STOCK

describe('LabelDocument', () => {
  withDatabase()

  it('round-trips a gs1-retail label', async () => {
    const saved = await LabelDocument.create({
      name: 'Granola 340g',
      labelType: 'gs1-retail',
      stock: STOCK,
      data: { gtin: '036000291452' },
    })
    const read = await LabelDocument.findById(saved._id).lean()
    expect(read?.data).toEqual({ gtin: '036000291452' })
  })

  it('round-trips a us-food label without flattening its nested data', async () => {
    // Mixed is stored opaquely, which is the point - but it is worth proving
    // that a nutrition panel comes back with its structure intact rather than
    // as something Mongoose decided to reshape.
    const data = {
      statementOfIdentity: 'Oat and almond granola',
      container: { shape: 'rectangular', widthMm: 120, heightMm: 240 },
      netQuantity: { inchPound: 'NET WT 12 OZ', metric: '(340 g)' },
      nutritionFacts: { servingSize: '1/2 cup (40g)', servingsPerContainer: 8, amounts: { calories: 150 } },
    }
    const saved = await LabelDocument.create({ name: 'Granola', labelType: 'us-food', stock: STOCK, data })
    const read = await LabelDocument.findById(saved._id).lean()
    expect(read?.data).toEqual(data)
  })

  it('refuses a label type it does not know', async () => {
    await expect(
      LabelDocument.create({ name: 'Nope', labelType: 'gs1-pallet', stock: STOCK, data: {} }),
    ).rejects.toThrow()
  })

  it('records when it was created and last changed', async () => {
    const saved = await LabelDocument.create({
      name: 'Timestamps',
      labelType: 'gs1-retail',
      stock: STOCK,
      data: { gtin: '036000291452' },
    })
    expect(saved.createdAt).toBeInstanceOf(Date)
    expect(saved.updatedAt).toBeInstanceOf(Date)
  })
})

describe('serializeLabelDocument', () => {
  withDatabase()

  it('hands back a string id and no version key', async () => {
    const saved = await LabelDocument.create({
      name: 'Serialised',
      labelType: 'gs1-retail',
      stock: STOCK,
      data: { gtin: '036000291452' },
    })
    const body = serializeLabelDocument(saved)
    expect(typeof body.id).toBe('string')
    expect(body).not.toHaveProperty('_id')
    expect(body).not.toHaveProperty('__v')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run --project api src/labels/labelDocument.test.ts
```

- [ ] **Step 3: Write the model**

```ts
/**
 * A saved label, as the database holds it.
 *
 * **`data` is `Mixed`, and that is deliberate.** Mongoose gets no say over the
 * shape of a label's fields; Zod does, in `schemas.ts`, which is the same
 * schema the export routes validate against. Restating three large label-data
 * shapes in a second schema language would be a second source of truth for the
 * same facts, and keeping two of those in step is what `getSymbologyConstraints`
 * was introduced into `routes.ts` to stop having to do.
 *
 * The trade is real and is taken knowingly: nothing at the database level stops
 * a malformed `data` being written. The API is the only writer, it validates
 * every write, and `labelDocumentRoutes.ts` validates every read as well, on the
 * grounds that a stored document is untrusted input the moment the schema moves.
 */
import { Schema, model } from 'mongoose'
import { LABEL_TYPES } from './schemas'

const labelDocumentSchema = new Schema(
  {
    // Not unique. Two drafts of the same product is a normal thing to want, and
    // a uniqueness index refuses it with a database error rather than a
    // sentence a user can act on.
    name: { type: String, required: true, trim: true, maxlength: 120 },
    labelType: { type: String, required: true, enum: LABEL_TYPES },
    stock: {
      widthMm: { type: Number, required: true },
      heightMm: { type: Number, required: true },
      marginMm: { type: Number, required: true },
    },
    data: { type: Schema.Types.Mixed, required: true },
  },
  // Findings are never stored: DESIGN.md settles this, and the reason is the one
  // the application rests on - a finding must reflect the current rule set, and
  // a stored verdict is a verdict that was true once.
  { timestamps: true, versionKey: false },
)

export const LabelDocument = model('LabelDocument', labelDocumentSchema)


export interface SerializedLabelDocument {
  id: string
  name: string
  labelType: string
  stock: { widthMm: number; heightMm: number; marginMm: number }
  data: unknown
  createdAt: string
  updatedAt: string
}

/**
 * What a client is given.
 *
 * `_id` becomes a string `id`, because an ObjectId is a database detail and a
 * client that receives one starts depending on its shape. The version key is
 * off at the schema rather than stripped here, so there is nothing to forget to
 * strip in a route added later.
 */
export function serializeLabelDocument(document: {
  _id: unknown
  name: string
  labelType: string
  stock: { widthMm: number; heightMm: number; marginMm: number }
  data: unknown
  createdAt: Date
  updatedAt: Date
}): SerializedLabelDocument {
  return {
    id: String(document._id),
    name: document.name,
    labelType: document.labelType,
    stock: document.stock,
    data: document.data,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  }
}
```

- [ ] **Step 4: Run and watch it pass, then commit**

---

## Task 6: The CRUD routes

**Files:**

- Create: `apps/api/src/labels/labelDocumentRoutes.ts`
- Test: `apps/api/src/labels/labelDocumentRoutes.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import supertest from 'supertest'
import { describe, expect, it } from 'vitest'
import { DEFAULT_UPC_A_STOCK } from '@packwright/label-core'
import { createApp } from '../app'
import { LabelDocument } from './labelDocument'
import { withDatabase } from '../testing/withDatabase'

const app = () => createApp({ enableLogging: false })
const STOCK = DEFAULT_UPC_A_STOCK
const A_LABEL = {
  name: 'Granola 340g',
  labelType: 'gs1-retail',
  stock: STOCK,
  data: { gtin: '036000291452' },
}

describe('/api/labels', () => {
  withDatabase()

  it('creates a label and returns it with an id', async () => {
    const response = await supertest(app()).post('/api/labels').send(A_LABEL)
    expect(response.status).toBe(201)
    expect(typeof response.body.id).toBe('string')
    expect(response.body.data).toEqual({ gtin: '036000291452' })
  })

  it('refuses a body whose data belongs to another label type', async () => {
    const response = await supertest(app())
      .post('/api/labels')
      .send({ ...A_LABEL, labelType: 'us-food' })
    expect(response.status).toBe(400)
    expect(response.body.detail).toBeInstanceOf(Array)
  })

  it('lists labels newest first, without their data', async () => {
    await LabelDocument.create({ ...A_LABEL, name: 'Older' })
    await LabelDocument.create({ ...A_LABEL, name: 'Newer' })
    const response = await supertest(app()).get('/api/labels')
    expect(response.status).toBe(200)
    expect(response.body.map((entry: { name: string }) => entry.name)).toEqual(['Newer', 'Older'])
    // A list needs names and dates, not three nested label payloads.
    expect(response.body[0]).not.toHaveProperty('data')
  })

  it('reads one label in full', async () => {
    const created = await LabelDocument.create(A_LABEL)
    const response = await supertest(app()).get(`/api/labels/${created._id}`)
    expect(response.status).toBe(200)
    expect(response.body.data).toEqual({ gtin: '036000291452' })
  })

  it('answers 404 for an id that is not an ObjectId', async () => {
    // A request for a label that does not exist, which is what 404 means.
    // Letting Mongoose's cast error become a 500 reports a server fault for a
    // client's typo.
    expect((await supertest(app()).get('/api/labels/nonsense')).status).toBe(404)
  })

  it('answers 404 for a well-formed id that names nothing', async () => {
    expect((await supertest(app()).get('/api/labels/64b7f0000000000000000000')).status).toBe(404)
  })

  it('replaces a label rather than merging into it', async () => {
    const created = await LabelDocument.create(A_LABEL)
    const response = await supertest(app())
      .put(`/api/labels/${created._id}`)
      .send({ ...A_LABEL, name: 'Renamed' })
    expect(response.status).toBe(200)
    expect(response.body.name).toBe('Renamed')
  })

  it('deletes a label', async () => {
    const created = await LabelDocument.create(A_LABEL)
    expect((await supertest(app()).delete(`/api/labels/${created._id}`)).status).toBe(204)
    expect(await LabelDocument.findById(created._id)).toBeNull()
  })

  it('reports a stored document that no longer validates rather than serving it', async () => {
    // The guard that cannot be reached by using the API normally, which is why
    // it is written here. A label saved under an older shape must not be handed
    // to the engine to mis-draw or to a rule to mis-judge.
    const created = await LabelDocument.create({ ...A_LABEL, data: { gtin: 'not-a-gtin' } })
    const response = await supertest(app()).get(`/api/labels/${created._id}`)
    expect(response.status).toBe(500)
    expect(JSON.stringify(response.body)).toContain(String(created._id))
  })

  it('leaves the export routes reachable on the same mount path', async () => {
    // /api/labels/:id is one segment; /api/labels/upc-a/export is two and POST
    // only. Asserted because "the CRUD router shadowed the exports" is the kind
    // of thing found in production rather than by reading.
    const response = await supertest(app())
      .post('/api/labels/upc-a/export')
      .send({ gtin: '036000291452' })
    expect(response.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run and watch them fail**

```bash
npx vitest run --project api src/labels/labelDocumentRoutes.test.ts
```

- [ ] **Step 3: Write the router**

```ts
/**
 * Saved labels.
 *
 * Every write is parsed by `LabelDocumentInput` before it reaches the database,
 * and every read of a full document is parsed by it again on the way back out.
 * The second is the one worth explaining: a stored document is untrusted input
 * the moment the schema moves, and a label saved under an older shape that
 * silently deserializes into something the engine mis-draws is the class of
 * defect this project keeps finding by review and never by its suite.
 */
import { Router, type Request, type Response } from 'express'
import { isValidObjectId } from 'mongoose'
import { LabelDocument, serializeLabelDocument } from './labelDocument'
import { LabelDocumentInput } from './schemas'

/** The export routes' error shape, reused so the API has one contract for a bad body. */
const badRequest = (response: Response, issues: { path: PropertyKey[]; message: string }[]) =>
  response.status(400).json({
    error: 'Invalid label document',
    detail: issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  })

export function createLabelDocumentRouter(): Router {
  const router = Router()

  router.get('/', async (_request: Request, response: Response) => {
    // Newest first: the thing most recently worked on is the thing most likely
    // to be wanted next. `data` is excluded rather than stripped afterwards, so
    // the cost of listing does not grow with the size of the labels in it.
    const documents = await LabelDocument.find({}, 'name labelType createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .lean()
    response.json(
      documents.map((document) => ({
        id: String(document._id),
        name: document.name,
        labelType: document.labelType,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
      })),
    )
  })

  router.post('/', async (request: Request, response: Response) => {
    const parsed = LabelDocumentInput.safeParse(request.body)
    if (!parsed.success) return badRequest(response, parsed.error.issues)
    const created = await LabelDocument.create(parsed.data)
    response.status(201).json(serializeLabelDocument(created))
  })

  router.get('/:id', async (request: Request, response: Response) => {
    const { id } = request.params
    if (!isValidObjectId(id)) return response.status(404).json({ error: 'Not found' })
    const document = await LabelDocument.findById(id).lean()
    if (document === null) return response.status(404).json({ error: 'Not found' })

    const parsed = LabelDocumentInput.safeParse({
      name: document.name,
      labelType: document.labelType,
      stock: document.stock,
      data: document.data,
    })
    if (!parsed.success) {
      // 500 is the honest code: the request was fine and the server's own data
      // is not. The id is named because finding the offending document is the
      // first thing anyone reading this will need to do.
      return response.status(500).json({
        error: `Saved label ${id} no longer matches the schema it was written with`,
        detail: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }
    response.json(serializeLabelDocument(document))
  })

  router.put('/:id', async (request: Request, response: Response) => {
    const { id } = request.params
    if (!isValidObjectId(id)) return response.status(404).json({ error: 'Not found' })
    const parsed = LabelDocumentInput.safeParse(request.body)
    if (!parsed.success) return badRequest(response, parsed.error.issues)

    // Replaced, not merged. The editor holds the whole document, and merging a
    // partial update into a discriminated union is where a `us-food` label still
    // carrying a `gtin` comes from.
    const updated = await LabelDocument.findOneAndReplace({ _id: id }, parsed.data, {
      new: true,
      timestamps: true,
    })
    if (updated === null) return response.status(404).json({ error: 'Not found' })
    response.json(serializeLabelDocument(updated))
  })

  router.delete('/:id', async (request: Request, response: Response) => {
    const { id } = request.params
    if (!isValidObjectId(id)) return response.status(404).json({ error: 'Not found' })
    const deleted = await LabelDocument.findByIdAndDelete(id)
    if (deleted === null) return response.status(404).json({ error: 'Not found' })
    response.status(204).end()
  })

  return router
}
```

- [ ] **Step 4: Mount it in `app.ts`**

Add the import, and mount **before** the export router so the shorter paths are matched first:

```ts
import { createLabelDocumentRouter } from './labels/labelDocumentRoutes'
```

```ts
  app.use('/api/labels', createLabelDocumentRouter())
  app.use('/api/labels', createLabelRouter())
```

- [ ] **Step 5: Run and watch them pass, then commit**

---

## Task 7: `/health` reports the database

**Files:**

- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/src/app.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it('reports the database as part of liveness', async () => {
  const response = await supertest(
    createApp({ enableLogging: false, databaseStatus: () => 'connected' }),
  ).get('/health')
  expect(response.status).toBe(200)
  expect(response.body.database).toBe('connected')
})

it('fails the probe when the database has gone away', async () => {
  // Phase 8 puts an ALB target group behind this. A task that reports healthy
  // without a database holds a broken instance in service.
  const response = await supertest(
    createApp({ enableLogging: false, databaseStatus: () => 'disconnected' }),
  ).get('/health')
  expect(response.status).toBe(503)
  expect(response.body.status).toBe('degraded')
})

it('reports healthy when nothing told it about a database', async () => {
  // The fifteen route tests that construct an app to ask about a PDF must not
  // need a connection to do it.
  expect((await supertest(createApp({ enableLogging: false })).get('/health')).status).toBe(200)
})
```

- [ ] **Step 2: Run and watch them fail**

```bash
npx vitest run --project api src/app.test.ts
```

- [ ] **Step 3: Add the option and use it**

In `AppOptions`:

```ts
  /**
   * How the database is doing, asked rather than looked up.
   *
   * Injected for the same reason `webRoot` is: `createApp` builds the same
   * application every time it is called, and importing mongoose here would make
   * every route test that asks about a PDF depend on a live connection. Absent
   * means "this app was built without a database", which is what the existing
   * route tests are.
   */
  databaseStatus?: () => DatabaseStatus
```

and at the top of `app.ts`, imported as a type only, so `app.ts` still pulls in no mongoose runtime code:

```ts
import type { DatabaseStatus } from './db'
```

Replace the `/health` handler:

```ts
  app.get('/health', (_req: Request, res: Response) => {
    const database = databaseStatus?.()
    // A probe that answers 200 without a database holds a broken task in
    // service, which is the one thing this endpoint exists to prevent.
    const healthy = database === undefined || database === 'connected'
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      ...(database === undefined ? {} : { database }),
      uptimeSeconds: Math.round(process.uptime()),
      environment: process.env.NODE_ENV ?? 'development',
      timestamp: new Date().toISOString(),
    })
  })
```

- [ ] **Step 4: Connect before listening, in `server.ts`**

```ts
import { connectToDatabase, databaseStatus } from './db'

const env = loadEnv()
const webRoot = resolveWebRoot()

// Before `listen`, so a server that is accepting requests is a server with a
// database. The alternative is a task that reports healthy and then 500s under
// traffic, which is the failure `env.ts` refuses at startup.
await connectToDatabase(env.MONGODB_URI)

const app = createApp({ enableLogging: env.NODE_ENV !== 'test', webRoot, databaseStatus })
```

- [ ] **Step 5: Run the full suite and commit**

```bash
npm test && npm run lint && npm run typecheck
```

---

## Task 8: A database for the browser suite, and for development

**Files:**

- Modify: `playwright.config.ts`
- Create: `docker-compose.yml`
- Modify: `README.md`

- [ ] **Step 1: Start a Mongo in the Playwright config**

```ts
import { MongoMemoryServer } from 'mongodb-memory-server'

/**
 * A database for the built server, started once.
 *
 * Playwright re-imports this config in every worker — the behaviour the Y4M
 * fixture works around with an atomic rename. Starting a `mongod` per worker
 * would launch one for each and leave the extras running, so it starts only in
 * the main process. Workers never need the URI: by the time they load, the
 * server is already up and holding the connection.
 */
const mongo =
  process.env.TEST_WORKER_INDEX === undefined ? await MongoMemoryServer.create() : undefined
```

Pass it to the server:

```ts
  webServer: {
    command: `npm run build && PORT=${PORT} NODE_ENV=production node apps/api/dist/server.js`,
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { MONGODB_URI: mongo?.getUri() ?? '' },
  },
```

- [ ] **Step 2: Run the browser suite**

```bash
npx playwright test
```

Expected: 28 passed. If the server fails to boot, read its output — `MONGODB_URI` being empty is now a startup
error rather than a silent degradation, which is the point.

- [ ] **Step 3: Add `docker-compose.yml` for local development**

```yaml
# A database for `npm run dev`. The tests do not use this - they start their own
# `mongod` through mongodb-memory-server, so a checkout with no Docker can still
# run the whole suite.
services:
  mongo:
    image: mongo:8
    ports:
      - '27017:27017'
    volumes:
      - packwright-mongo:/data/db

volumes:
  packwright-mongo:
```

- [ ] **Step 4: Tell a reader how to start it**

In `README.md`, beside the existing development instructions:

```markdown
The API needs a database. `docker compose up -d` starts one, and
`MONGODB_URI=mongodb://localhost:27017/packwright` points the server at it. The
process will refuse to start without it, on purpose — a server that boots without
somewhere to save is a server that reports healthy and fails on the first save.
```

- [ ] **Step 5: Full verification, then commit**

```bash
npm test && npm run lint && npm run typecheck && npm run format:check && npm run verify:build && npx playwright test
```

`verify:build` boots the built server — it will now need a `MONGODB_URI` too. If `scripts/verify-build.sh`
does not supply one, give it the same treatment as the Playwright config rather than making the variable
optional again.

---

## Done when

- `POST`, `GET`, `GET /:id`, `PUT` and `DELETE` on `/api/labels` all behave as the tests above describe
- A stored document that no longer validates is reported with its id, not served
- The server refuses to boot without `MONGODB_URI`, and `/health` answers 503 when the connection is lost
- The three export routes still pass every one of their existing tests, unchanged
- 28 browser tests still pass, against a server that now holds a database connection

# Persistence — saved labels

Phase 6, the last substantial item in its *Build* list. Written 2026-09-14, against `dev` at `09222b9`.

This stage delivers the model and the API and no user interface. The `/labels` list, the `/labels/:id` editor
route and the save/open experience are the stage after it, because they carry questions of their own — what
saving means in the middle of an edit, what happens to unsaved work — that have nothing to do with how a
document is stored.

---

## What is being decided

Four decisions shape everything below, and each was taken against something already written down in this
repository rather than on taste.

**Zod owns the shape of a saved label; Mongoose stores `data` as `Mixed`.** The export routes already carry
complete Zod schemas for all three label types. Restating those in a second schema language would be a second
source of truth for the same facts, which is the failure `getSymbologyConstraints` was introduced into
`labels/routes.ts` to end — each side had its own copy of the payload length and the magnification range,
tested against itself, so the two could drift apart without a single test failing. Mongoose gets no say over
`data`'s shape. That is the trade, taken deliberately: the API is the only writer, and a schema that cannot
drift is worth more here than database-level validation of a field.

**`MONGODB_URI` becomes required, and the process refuses to boot without it.** `env.ts` already argues this
case in its own docblock: reading `process.env` at each use site "defers a missing database URI until the first
request that needs it, which in a container means a task that reports healthy and then 500s under traffic". A
server that boots happily and answers 503 from its persistence routes is that same failure wearing a different
hat.

**A document read back out of Mongo is parsed again before anything is done with it.** A stored document is
untrusted input the moment the schema moves. A label saved under an older shape that silently deserializes
into something the engine mis-draws, or that a rule then judges, is the exact class of defect this project
keeps finding by review and never by its suite.

**`templateId` is dropped from the model.** `docs/DESIGN.md` sketches it, and it has no referent:
`packages/label-core/src/templates/` exports element maps and defaults, not identified templates, and
`labelType` already selects which `layOut*` function runs. A field naming nothing is a field that will be
filled in with something arbitrary and then read as meaningful.

---

## Module layout

```
apps/api/src/
  db.ts                        connection lifecycle
  labels/
    schemas.ts                 the Zod shapes, shared by both routers
    routes.ts                  export routes — imports from schemas.ts
    labelDocument.ts           the Mongoose model
    labelDocumentRoutes.ts     CRUD
```

`schemas.ts` is the load-bearing part. The field-level pieces — `Artwork`, `DigitalLink`, `GhsSupplierSchema`,
`ContainerSchema`, `NetQuantitySchema`, `IngredientSchema`, `NutritionFactsSchema`, `ResponsibleFirmSchema`
and the nutrient amounts — move out of `routes.ts` unchanged, together with the `toX` mappers that reconcile
Zod's `string | undefined` with `label-core`'s genuinely-absent optionals under `exactOptionalPropertyTypes`.

`routes.ts` is 752 lines today and loses roughly a third of that. It is not being refactored for its own sake:
the schemas have to be shared, and sharing them is what shrinks it.

`schemas.ts` gains one new composite, `LabelDocumentInput` — a `z.discriminatedUnion('labelType', …)` over
`{ name, labelType, stock, data }`. The export routes keep their present flattened request shape, rebuilt from
the same pieces, so no existing endpoint changes.

**`stock` is required on a saved document**, which is where it differs from the export request that treats it
as optional and falls back to `DEFAULT_UPC_A_STOCK` and its siblings. A saved label records the stock it was
designed at. Inheriting a default instead would mean that changing one of those constants silently resizes
every label already stored against it, and the resize would first be visible in a PDF someone sent to a
printer.

---

## The data model

```ts
LabelDocument {
  _id,
  name,                                                    required, trimmed, not unique
  labelType: 'gs1-retail' | 'ghs-chemical' | 'us-food',
  stock: { widthMm, heightMm, marginMm },
  data,                                                    Mixed — validated by Zod, never by Mongoose
  createdAt, updatedAt                                     Mongoose timestamps
}
```

**Findings are never stored.** `docs/DESIGN.md` says so, and the reason is the one this whole application
rests on: a finding must reflect the current rule set. A stored verdict is a verdict that was true once.

**`name` is not unique.** Two drafts of the same product is a normal thing to want, and a uniqueness
constraint would refuse it with a database error rather than a sentence.

---

## API surface

| method | path | |
|---|---|---|
| `GET` | `/api/labels` | list — `name`, `labelType`, `updatedAt` only |
| `POST` | `/api/labels` | create |
| `GET` | `/api/labels/:id` | one, in full |
| `PUT` | `/api/labels/:id` | replace |
| `DELETE` | `/api/labels/:id` | remove |

**The list omits `data`.** A list view needs names and dates, not three nested label payloads, and sending
them would make the cost of listing grow with the size of the labels in it.

**`PUT` and not `PATCH`.** The editor holds the whole document. Merging a partial update into a discriminated
union is where inconsistent states come from — a `labelType` of `us-food` beside a `data` still carrying a
`gtin`.

**A malformed `ObjectId` is a 404, not a 500.** `/api/labels/nonsense` is a request for a label that does not
exist, which is what 404 means; letting Mongoose's cast error become a 500 reports a server fault for a
client's typo.

`POST` and `PUT` both return the saved document in full; `DELETE` returns 204 with no body. The list is
ordered by `updatedAt` descending, because the thing most recently worked on is the thing most likely to be
wanted next. Every response renames `_id` to a string `id` and drops `__v`: the client has no use for
Mongoose's version key, and leaking it invites something to start depending on it.

---

## Validation

Writes parse through `LabelDocumentInput` and reuse the error shape the export routes already return —
`{ error, detail: [{ path, message }] }` — so the API has one contract for a bad body rather than two.

Reads on `GET /:id` parse the stored document back through the same schema. One that no longer fits returns
500, naming the id and the failing path, rather than handing it to the engine. 500 is the honest code: the
request was fine and the server's own data is not.

The list endpoint performs no read validation, because it never returns `data`. That keeps the parse off the
common path as a consequence of the shape rather than as an optimisation.

---

## Startup and configuration

`MONGODB_URI` stops being `optionalSecret` in `env.ts` and becomes required, keeping the `blankAsAbsent`
treatment so that an ECS variable declared with an empty value is still reported as missing rather than
failing a non-empty check.

`db.ts` connects before `listen` and disconnects on shutdown.

**`/health` reports the mongoose `readyState`.** Phase 8 puts an ALB target group behind this endpoint. With
the URI required at startup a booted server has a database, but a connection lost afterwards is a real state,
and a task that reports healthy without one is the same failure `env.ts` already refuses at startup.

`docker-compose.yml` gains a mongo service for local development.

---

## Testing

`mongodb-memory-server` as a dev dependency.

Model tests round-trip all three label types and prove that a document which fails read validation is reported
rather than rendered — that one is the point, since it is the guard that cannot be checked by using the API
normally.

Route tests use `supertest`, which `apps/api` already has, and cover all five endpoints together with the 400
and 404 paths.

Fixtures are built from `label-core`'s own defaults rather than copied from the web store's `STARTING_*`
constants, so there is no second set of shapes to drift.

**One wrinkle to handle rather than discover.** Playwright re-imports `playwright.config.ts` in every worker —
the behaviour the Y4M fixture already works around with an atomic rename. Starting `mongodb-memory-server`
there unguarded would launch one per worker. It is started only in the main process, guarded on
`process.env.TEST_WORKER_INDEX === undefined`, and its URI passed through `webServer.env`. Workers never need
it: by the time they load, the server is already running.

---

## Not in this stage

The `/labels` list view, the `/labels/:id` editor route, and the save and open experience. `docs/DESIGN.md`
already treats `/labels` and `/labels/:id` as separate route work, and the questions they raise — what saving
means mid-edit, what happens to unsaved changes — are about the editor rather than about storage.

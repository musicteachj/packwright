# Saved labels, in the editor

Phase 6's deferred user interface. Persistence shipped as an API in stage 6 with no way to reach it; `/labels`
and `/labels/:id` have been in the router's inventory since phase 3, waiting for it.

Written 2026-09-14, against `dev` at `c4bfe16`. Spec and implementation plan in one document, because it is
being executed in the session that wrote it — the separation exists so a plan survives the conversation that
produced it, and that is not what is happening here.

---

## What is being decided

**The editor knows which saved label it is editing.** `/labels/:id` loads a document and the editor holds its
id; Save is a `PUT`, Save As is a `POST`. The alternative — every save creating a record — turns the list into
a pile and leaves `/labels/:id` unimplemented. It is also the only shape in which the round-trip defect below
can be closed at all: an export cannot use a saved label's own stock unless the editor knows which saved label
it has.

**Switching label type detaches the document.** A saved label is one type; its `data` is a discriminated union
keyed on it. Opening a `gs1-retail` label and switching to GHS gives the editor its GHS document, no longer
attached, so Save becomes Save As. The API would accept the conversion without complaint, which is exactly why
the client must not offer it: a stored record would change kind because somebody clicked a tab, and its name
would still describe what it used to be.

**Unsaved work is tracked and defended.** An indicator alone tells you where you stand and still lets an hour
of editing vanish because somebody clicked "Rules" in the masthead.

---

## Modules

| file | responsibility |
|---|---|
| `apps/web/src/api/savedLabels.ts` | **new.** Typed client for the five endpoints. |
| `apps/web/src/views/LabelsView.vue` | **new.** The list. |
| `apps/web/src/stores/labelDocument.ts` | **modified.** Attachment, baseline, dirty state. |
| `apps/web/src/views/EditorView.vue` | **modified.** Save controls, name field, route guard. |
| `apps/web/src/router/index.ts` | **modified.** `/labels` and `/labels/:id`. |
| `apps/web/src/components/SiteHeader.vue` | **modified.** A link to the list. |

`EditorView` already reaches the API with a bare `fetch` for export. Saved-label calls go through one module
instead, so the `id`-to-URL shape and the error handling live in one place rather than at each call site.

---

## Attachment and dirty state

The store gains `savedId`, `savedName`, a `baseline` snapshot of what was last written, and an `isDirty`
computed comparing the **active type's** `data`, `stock` and name against it.

**The comparison sorts keys.** The editor's document is built by the store; a loaded one arrives through JSON.
Key order is not guaranteed to survive that trip, and a naive `JSON.stringify` compare would report every
freshly-loaded label as dirty the moment it opened — an indicator that is always on is an indicator nobody
reads.

A watcher on `labelType` clears `savedId` whenever one is set, which is how the detach above is enforced
rather than merely intended.

---

## The Save control

| state | reads | does |
|---|---|---|
| never saved | **Save** | `POST`, then attach |
| attached, dirty | **Save** | `PUT` |
| attached, clean | **Saved**, disabled | nothing |
| any | **Save as new** | `POST`, then attach to the new record |

`name` is required by the schema, so it is a field at the top of the form rail rather than a modal: this
project has no dialog component and this stage should not introduce one to ask for a single string.

---

## Leaving with unsaved work

`onBeforeRouteLeave` covers navigation inside the application, and a `beforeunload` handler covers closing the
tab. Both are gated on `isDirty` and both are removed when the editor unmounts.

`beforeunload` cannot carry a message — every browser shows its own generic wording — so it is a blunt
instrument, and it is here because losing an edited label to a closed tab is worse than a generic prompt.

---

## The round-trip defect, closed

`docs/BACKLOG.md` records it: a saved label holds `stock` beside `data`, while the export request takes them
flattened and defaults a missing `stock` to `DEFAULT_UPC_A_STOCK` or its siblings. Handing an export route the
`data` of a saved label prints it at whatever the default happens to be rather than at the size it was
designed at — silently, and invisible until somebody measures a printed sheet.

It becomes reachable in this stage, because this is the stage that makes "open a saved label, then export it"
a thing a user can do. **Loading restores `stock` as well as `data`**, and a browser test carries the round
trip: save, reload the editor from `/labels/:id`, export, and assert the PDF's page box matches the stock that
was saved rather than the default.

---

## Not in this stage

Pagination, search, and duplicate. Pagination is already in `docs/BACKLOG.md` and belongs with a list long
enough to need it; the other two are features rather than gaps.

---

## Plan

Each task ends green. `/code-review medium` with no target before each commit, per the ladder.

### 1. The API client

Create `apps/web/src/api/savedLabels.ts` — `listLabels`, `readLabel`, `createLabel`, `replaceLabel`,
`deleteLabel` — over `fetch`, throwing a typed error carrying the server's `detail` array when the response is
not ok. Test with a stubbed `fetch`: a 400 surfaces its detail, a 404 is distinguishable from a 500.

### 2. Attachment in the store

Add `savedId`, `savedName`, `baseline`, `isDirty`, and the actions `loadSaved`, `markSaved`, `detach`, plus
the `labelType` watcher. Tests: a loaded document is not dirty; editing a field makes it dirty; saving clears
it; switching type detaches.

### 3. The list view

`LabelsView.vue` at `/labels` — name, type, last changed, open, delete behind a confirm. An empty state that
says how to make the first one. Tests: rows render from the client, delete removes a row, the empty state
appears with no labels.

### 4. Save in the editor

The name field, the Save control's four states, and the wiring to the client. Tests for each state.

### 5. The guards

`onBeforeRouteLeave` and `beforeunload`, both gated on `isDirty`, both torn down on unmount. Tests: a clean
editor leaves without a prompt; a dirty one does not.

### 6. The round trip, in a browser

Extend the browser suite: create a label at a non-default stock, open it from `/labels/:id`, export, and
assert the page box matches. This is the task the whole stage exists to make possible.

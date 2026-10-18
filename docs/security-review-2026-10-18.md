# Security review before deployment, 2026-10-18

The last check before Phase 8 of what the deployed application exposes to anyone on the internet. The only app-wide
security pass before this one was on 2026-09-13 (`docs/BACKLOG.md`, "From the pre-stage-2 security pass"). Since
then the public `/mcp` server and saved labels have been added, and the photo audit has taken its current shape.

The bar for acting on a finding is the one in `CLAUDE.md` until Phase 8 is deployed. A security hole, a crash or
data loss gets work; anything else is one line here.

## How it was checked

Run on `dev` at `399e844`. The surface was split three ways, and each part was read and probed by a separate
read-only reviewer:
- saved labels and the export routes;
- the photo audit;
- `/mcp`, with every function its tools reach in `label-core`.

Each probe ran against the application's own handlers: `createApp` through supertest, or the handler `/mcp` mounts.
The database was in memory, and no call reached Anthropic. The session that wrote this record then checked every
must-fix finding itself, rather than relying on the reviewer: findings 1 and 2 were re-measured with its own scripts,
and findings 3, 4 and 5 were confirmed by reading the code the reviewer named. The request counts and sizes given for
4 and 5 are the reviewers' measurements. The request
wiring, startup, static file serving, the label preview's `v-html` and the dependency audit were read directly in
that session.

Times are wall-clock on a Mac with Node 24. Each one blocks the server's single event loop, and with it `/health`,
the load balancer's liveness probe.

## Must fix before deployment

| # | where | what is wrong | measured | kind |
|---|---|---|---|---|
| 1 | `label-core` schema and text code, reached by every public route | **Unbounded input meets superlinear code.** No free-text field has a maximum length and no array a maximum count. Stock and box dimensions are only `.positive()` (1e9 mm passes), and font sizes have no floor (5e-324 passes). Six places then grow quadratically or worse: `wrapTextMm` (`text/measure.ts`) re-measures the whole line for every word; `labelFilename`'s `/^-+|-+$/g`; `withoutTrailingSlashes`' `/\/+$/`; `parseDigitalLinkUri`'s URI pattern; the net quantity rule's `SI_AMOUNT`; and PDFKit's text layout, which is quadratic in spaces. | Through the real routes, within the 256 KB body limit: `check_label` 308 s (wrapping on 1e9 mm stock), 194 s (Digital Link), 5.3 s at 40 K (SI amount; the pattern alone 212 s at 250 K); export 29 s (filename), about 31 s (artwork text in the PDF). Re-measured here: the filename pattern 4.5 s at 100 K, the Digital Link pattern 0.76 s at 16 K, `SI_AMOUNT` 52 ms at 4 K, each quadrupling or worse per doubling. **Fixed by fix 1:** each path under 5 ms at 32 K; past a bound, refused in under 40 ms; the worst case inside the bounds, `check_label` on a list spread over all nine allergens, takes about 0.5 to 0.75 s. | denial of service |
| 2 | `/api/audit` | **The daily spending cap does not hold.** The 10 MB body is parsed before any guard runs, and a nested body costs 653 ms of blocking CPU and about 440 MB to parse (measured here). Sixteen at once delayed `/health` by 6.4 s (the reviewer's measurement). The daily counter is in memory, so a task the load balancer replaces starts again at zero. The parse order was recorded in `docs/BACKLOG.md` ("From the pre-stage-2 security pass") as a cost of refusing; that it can reset the spending cap is new, and fix 2 settles that entry. | 653 ms and about 440 MB per 10 MB body. **Fixed by fix 2:** the body is read only after the limiter and the key, so the same body without a key is refused in 15 ms; the day's count is in the database. | unbounded cost |
| 3 | `/api/audit` | **The daily cap can be drained for free.** `image.data` is `z.string().min(1)`, and `today.take()` counts the call before anything checks the data is an image, so a one-character "image" spends one of the day's 200 calls and Anthropic rejects it at no cost. Twenty an hour from one address drains the day in ten hours; ten addresses do it in under a minute. Real users then get 429 until the window resets. | confirmed in code. **Fixed by fix 2:** data that is not base64 opening as its declared type is refused with 400 before anything is counted, and the key is required on the public deploy. | denial of service |
| 4 | `/api/labels` (saved labels) | **Saved labels have no owner and no write limit.** Any caller can list them, read any of them, overwrite any with `PUT`, delete any with `DELETE`, and fill the global 20-label cap so nobody else can save. No rate limiter is mounted on these routes. | confirmed in code and by the reviewer's requests | data loss |
| 5 | `/mcp` | **Only `tools/call` is counted.** A 4.5 KB legacy batch of 100 `tools/list` returns 2.44 MB and counts as nothing; a batch of one call and 99 lists counts as one. The counter's comment says what goes uncounted is cheap, since no label is drawn, and "bounded by the body limit", but a batch multiplies the response about 500 times past the body. `subscriptions/listen` is uncounted too, and one client held all 1,024 subscription slots open in 3 s. | 2.44 MB per request; 1,024 sockets | unbounded cost |

**Worst-case audit spend while the cap holds.** The extraction calls `claude-opus-5` with `max_tokens` 4,000 and one
retry. At the reviewer's figures of about $0.13 a call, or $0.27 when retried, the 200-a-day cap is about $26 a day,
or $54 if every call is retried. Findings 2 and 3 are why that figure is not a bound.

## Decisions (James, 2026-10-18)

- **Saved labels get an edit token.** Creating a label returns a secret the browser keeps, and changing or deleting
  the label requires it. Reading stays open by link, and there are still no accounts. Writes also get a rate limit.
- **The audit is keyed on the public deploy (fix 2).** `AUDIT_API_KEY` is required in production wherever the
  Anthropic key is set, and the audit page has a field for it: the person types the key, the browser keeps it,
  and nothing in the bundle carries it. The daily cap is a setting, `AUDIT_DAILY_LIMIT`, 10 unless set, so it can
  follow the spend limit below down. No per-address share of the cap: with the key required, it would protect
  nothing a key holder cannot already be trusted with.
- **A hard monthly spend limit on the Anthropic workspace that owns the audit key.** It needs no code, and it is the
  one bound that holds when the application's own caps do not. It is James's to set, before the deploy.

**A deployment requirement this review rests on.** Every per-address figure above assumes `TRUST_PROXY_HOPS=1`
behind the load balancer. The variable is optional (`env.ts`), and unset it makes `request.ip` the balancer's
address: every audit caller then shares one 20-an-hour bucket, every `/mcp` caller one 60-an-hour bucket, and the
Anthropic tier never matches. Phase 8's checklist names it under `/mcp`; it governs the audit and export limits too.

## The fixes

Four pull requests, each reviewed at `high`:

1. **Input bounds and linear text code (finding 1).** Maximum lengths and counts in the shared schema, sized so no
   real label is refused; upper bounds on dimensions and a floor on font sizes; `wrapTextMm` keeps a running width;
   the four patterns rewritten to run in linear time.
2. **The audit's guards (findings 2 and 3).** The limiter and the key check run before the body is parsed; the
   image data must be base64 whose leading bytes match its declared type before a call is counted; and the daily
   count is held in the database, so a restart does not reset it. An anonymous shared budget can always be drained
   by enough addresses, so James chose to require `AUDIT_API_KEY` on the public deploy (see the decisions above),
   with a field on the audit page to type it in, rather than a WAF rule or a per-client share. **What that leaves:**
   a key holder can still spend the day's calls, which is the trust the key gives them.
3. **Saved labels (finding 4).** The edit token, and a per-client limit on writes. **What that leaves:** creating a
   label needs no token, so enough addresses can still fill the global 20-label cap, and only their own tokens can
   delete those labels. The remedies are a per-client share of the cap, labels that expire, or a larger cap. That is
   James's choice too, asked when fix 3 is planned.
4. **`/mcp` and the rest (finding 5).** Every message in a batch counts, and subscriptions are capped or counted.
   This PR also carries the lockfile update below and truncates validation errors.

## Recorded, no work

One line each, by the bar. `docs/BACKLOG.md` points here rather than repeating them:
- `npm audit --omit=dev` reports `proxy-addr` 2.0.7 as critical (GHSA-jqcg-44mw-7w3h). It applies only to a trust
  subnet written in IPv6 notation, while this server trusts a hop count, and the `/mcp` Anthropic range check uses
  Node's `BlockList`. The patch is in range, so it rides with fix 4.
- `@vue/server-renderer` <3.5.42 (GHSA-g2v6-rqmx-r4w6) is a server-rendering XSS; the client renders in the browser.
  The patch is in range, so it rides with fix 4.
- `source-map-js` and `esbuild` advisories are build- and dev-server-only.
- A vision call retried by the SDK is billed twice and counted once (`VISION_MAX_RETRIES = 1`). It is bounded at
  double.
- A vision call keeps running after the client disconnects: two attempts of 120 s exceed the load balancer's 60 s
  idle timeout. It was already counted, so this is bounded.
- Extreme numbers (1e308 stock, 1e300 magnification) reach PDFKit and answer a generic 500, with a stack in the
  log. Fix 1's bounds remove them.
- `Content-Disposition` grows with the label's identifier (a 40 KB header was produced); the charset is safe. Fix 1's
  bounds cap it.
- An `/mcp` input-validation error echoes every bad item (754 KB for 4,900 bad codes). Truncated in fix 4.
- Anyone can point a claude.ai custom connector at `/mcp` and spend the shared Anthropic tier (5,000 an hour); this
  was recorded with the tiers on 2026-10-10.
- `/health` reports `environment` and `uptimeSeconds`. That is harmless.
- Concurrent saves at the cap can all be refused; the cap never overshoots (`labelDocumentRoutes.ts`, as commented).

## Checked and sound

- **Client addresses.** With `trust proxy` set to a hop count of 1, a forged `X-Forwarded-For` is ignored. This
  assumes the load balancer appends to the header, its default; check the deployed listener in Phase 8. IPv6
  callers are keyed by /56, the `express-rate-limit` 8.7 default. The `/mcp` Anthropic tier admits only the exact
  /21 and its `::ffff:` dotted form.
- **Injection.** Ids are gated by `isValidObjectId`. Express 5's simple query parser makes `?before[$gt]=` a literal
  key. Zod strips `__proto__`, `constructor` and `$where` keys, and no schema on these paths uses `passthrough` or
  `z.any`.
- **The audit key** is compared as SHA-256 digests with `timingSafeEqual`, after the limiter. It is never logged
  or echoed.
- **Errors.** Every route answers with fixed text; details go to the log only. No stack or path reached a
  response.
- **Prompt injection through a photo.** The vision call has no tools and fetches nothing. Its reply is bounded by
  `max_tokens`, checked for truncation, and re-validated by Zod. Nothing extracted enters a label until the user
  confirms it.
- **The label preview.** `toSVG` escapes every string it interpolates before the editor renders it with `v-html`.
  The three raw attributes are a number and two closed unions set by the engine. The CSP (`script-src 'self'
  'wasm-unsafe-eval'`) also forbids inline script and event handlers.
- **`/mcp`.** Host and Origin checks hold (a foreign Host, an Origin of `null` and lookalikes all get 403); sessions
  are stateless (a fresh server per request); malformed JSON-RPC and oversized batches get 400.
- **Fonts.** PDF fonts are chosen through `Object.hasOwn` over a closed list, so no request value reaches a path.
- **Static files and startup.** Files are served only from the build directory, with dotfiles ignored. The server
  does not listen without a database, or with a client build that lacks its page list. With no client build at all
  it starts as the JSON API alone and logs that; `npm run verify:build` and Phase 8's checks are what catch an image
  built without the client.
- **CORS.** None is mounted, by design (`app.ts`).

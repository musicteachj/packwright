# Packwright portfolio demo readiness (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Packwright ready, on James's machine, to run as a public no-sign-up demo: live photo reads paid from a fixed, paced monthly budget behind a bot check and a per-visitor allowance, a free path (the editor and the recorded sample) on the first screen, and a production image that holds no secrets.

**Architecture:** Every live read goes through one metered wrapper: it reserves the worst case in a Mongo ledger (integer micro-dollars, atomic guarded `$inc` on a day total and a month total), calls Claude with SDK retries off, a 60 s timeout and an abort signal tied to the visitor's connection, then settles from the reply's usage (or keeps the reservation when the outcome is unknown). Public mode replaces the shared audit key with a Cloudflare Turnstile check that runs before the photo body is read, a per-visitor daily count in Mongo, and a status endpoint (`{available, reason, siteKey}`) the audit page reads before it shows the bot check. The image is a three-stage `node:24-slim` build (build, the API's run-time dependencies, run) that runs as `node`, with a `.dockerignore` that keeps every `.env` out.

**Tech Stack:** Node 24 and npm 11, Express 5, Mongoose 9, Zod 4, `@anthropic-ai/sdk` 0.116, `express-rate-limit` 8.7, Vue 3 and Vite 8, Vitest 4, Playwright, Docker (`node:24-slim`, `mongo:8`), Cloudflare Turnstile, GitHub Actions.

**Spec:** `/Users/jameslittlefield/Documents/github_things/portfolio-infra/docs/design/2026-11-18-portfolio-apps-aws-deployment-design.md` (v2.1): sections 5.1, 5.2, 5.3, 5.4 (Packwright), 5.10 items 3 to 5 and 7 to 8, and section 10. Master plan and shared conventions: `/Users/jameslittlefield/Documents/github_things/portfolio-infra/PLAN.md`. This plan supersedes the deployment parts of `docs/plans/2026-10-08-road-to-deployment.md` and the build and settle-before-deploying parts of `docs/DESIGN.md` § Phase 8.

## Global Constraints

- **Git, hard rule.** James approves every commit, push, merge and pull request, one action at a time. Every commit step in this plan reads: "Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing." A push and a PR are two separate stops. Approval never carries over. Commit messages end with the attribution trailer the session supplies.
- **No paid calls.** No Anthropic call with a real key anywhere in this plan. Tests use fakes, `apps/api/src/audit/fixtures/recorded.json`, and Turnstile test keys (which `siteverify` answers locally, decision 22); nothing calls Cloudflare's siteverify. Never run `npm run record:extraction`, `write:sample-reading` against a live key, `experiment:without`, `experiment:mcp`, and never set `PACKWRIGHT_LIVE_EXTRACTION`. The local container uses a dummy Anthropic key with `AI_MONTHLY_BUDGET_USD=0`. Free documentation reads (Anthropic docs, Cloudflare docs, `docker pull`) are allowed.
- **Writing.** American English everywhere, including new identifiers (`DESIGN_CATALOG`, not `CATALOGUE`). No em dashes anywhere: copy, comments, docs, test names, commit and PR text. Use a colon, a comma, parentheses or two sentences.
- **Packwright's `CLAUDE.md`.** Before each commit run `/code-review medium` with no target on the uncommitted diff. Under Packwright's finish-line bar, fix only the findings that are a false clearance, an unverifiable citation, a crash, data loss or a security hole, and re-run the review if the fixes are more than a few lines. List every other finding in the next PR's description: `docs/BACKLOG.md` is frozen and gets no new entries. Mutation-test every guard and fix: revert it, confirm the named test fails, restore. Update `CHANGELOG.md` (under `## [Unreleased]`) in the same edit as each change. `label-core` imports no framework, and no task here changes `packages/label-core/src/rules`, `fda` or `layout`. Tailwind theme tokens, never raw hex.
- **PR size.** At every commit stop, run `git diff --shortstat dev...HEAD`. Past about 1,500 lines, propose a PR at that stop rather than waiting for the stage boundary (Packwright's `CLAUDE.md`: a PR at about 1,500 lines or a stage boundary, whichever comes first).
- **Record what was read and when** beside any figure taken from outside documentation (prices, the image-token cap, Anthropic's IP ranges and error wording, Turnstile test keys and siteverify fields), in the module note, as the repo already does ("read on 2026-11-19"). A document read for the first time also gets its line in `docs/SOURCES.md` (under "The photo audit"), in the task that reads it: Anthropic's pricing and vision pages (Task 4), Anthropic's errors page (Task 5), Cloudflare's siteverify and testing pages (Task 6).
- **Commands** (run from the repo root):
  - lint `npm run lint`; Prettier `npm run format:check` (fix with `npm run format`); types `npm run typecheck`
  - unit tests `npm test`; one file `npx vitest run <path>`; one test `npx vitest run <path> -t "<name>"`
  - build `npm run build`; built server `npm run verify:build`; browser `npm run test:e2e` (first time: `npx playwright install chromium`; locally, stop any server already on port 4173 first, because Playwright reuses it)
  - image (new in Task 2) `npm run verify:image`
  - "All checks" below means: lint, Prettier, types, unit tests, build, `verify:build`, and `test:e2e`.
- **Shared names and values** (portfolio-infra `PLAN.md`): `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`; test site key `1x00000000000000000000AA`, always-pass secret `1x0000000000000000000000000000000AA`, always-fail secret `2x0000000000000000000000000000000AA`; `AI_MONTHLY_BUDGET_USD` (Packwright 10; 0 means live reads off), `AI_PACING_MULTIPLIER` 3, `AI_DAILY_FLOOR_USD` 0.50, `AUDIT_READS_PER_IP_PER_DAY` 5; Opus 5.5 at $4 input and $20 output per million tokens, model `claude-opus-5-5` unchanged; `TRUST_PROXY_HOPS=1` required in production public mode; keep-alive 130000 ms with `headersTimeout` above it; graceful stop within 30 s; `USER node`.
- **Pacing (UTC):** `allowance_today = min(left, max(multiplier x left / days_left_including_today, floor))`, `left = budget - (settled + open) dated before today this month`. Admit a reservation only if today's (settled + open) + reservation <= `allowance_today`, and the month total stays within the budget.
- **Retention and processors copy:** saved labels expire after 7 days; processors are Anthropic (photo reads), Cloudflare (bot check), AWS (hosting), MongoDB Atlas (saved labels); server logs with IP addresses are kept 14 days.
- **Session end:** tick finished steps in this file and update Packwright's row in `portfolio-infra/PLAN.md` (that repo's commit needs its own OK).

## Decisions this plan makes that the spec does not settle

1. **Modes are exclusive.** `AUDIT_PUBLIC=true` (Turnstile, per-visitor count, ledger) or `AUDIT_API_KEY` (owner path, still metered by the ledger), never both: `loadEnv` refuses both set. In key mode the status endpoint tells browsers `available: false, reason: 'unconfigured'`, since the page no longer has a key field. The per-visitor daily count applies only when `AUDIT_PUBLIC` is true (James, 2026-11-19): key mode is bounded by the hourly limiter and the ledger, so `server.ts` passes `auditVisitors` only in public mode and the router counts visitors only when a Turnstile check is configured.
2. **`AUDIT_DAILY_LIMIT` and the deployment-wide `AuditDay` count are retired** in Task 8. The paced ledger bounds a day in dollars, and the per-visitor count replaces the per-day call count.
3. **New setting `TURNSTILE_HOSTNAMES`** (bare hostnames, like `MCP_ALLOWED_HOSTS`): siteverify's `hostname` must be one of them, and its `action` must be `audit`. The spec's single Turnstile site covers four hostnames, so without this a token minted on another app could be replayed here.
4. **New setting `MCP_ANTHROPIC_CALLS_PER_HOUR`**, default 1,000 (the code default drops from 5,000 to 1,000).
5. **Input bound instead of `count_tokens`:** `VISION_INPUT_TOKEN_BOUND = 8_000`: 4,784 image tokens at the 2576 px cap, plus 1,893 tokens of prompt and schema, which is `recorded.json`'s 2,537 input tokens less the 644 its 760 x 620 image costs under Anthropic's 28 px patch formula (`Math.ceil(760 / 28) * Math.ceil(620 / 28)` = 28 x 23 = 644, read on 2026-11-19). 4,784 + 1,893 = 6,677, rounded up to 8,000. Worst case per read: 8,000 x $4/M + 4,000 x $20/M = **$0.112** (112,000 micro-dollars). No extra network call per read.
6. **Timeout 60 s, `max_tokens` stays 4,000, `SLOWEST_TOKENS_PER_SECOND` rises from 40 to 70** (James, 2026-11-19, keeping all three). 4,000 / 70 = 57 s fits inside 60 s, so `extract.test.ts`'s "cannot want more tokens than the timeout allows" test still holds. The figure behind 70 is one timed call: Opus 5.5 returned 416 tokens in 4.7 s on 2026-11-18 (CHANGELOG), about 88 a second. A whole-call rate includes the time to the first token, so it understates the generation rate. A read slower than 70 a second that wants all 4,000 tokens times out and keeps its full reservation: over-counted, never under-counted. Measuring more needs paid calls, which are ruled out before launch.
7. **Prices are constants** in `apps/api/src/audit/pricing.ts`, not settings. A reply served by a model with no pinned price settles at the full reservation. No server-side fallbacks are added (the request is unchanged), so only Opus 5.5 is priced.
8. **Only the shared list settles to $0** (any 429, plain rate limits included, per the 2026-11-19 update in `portfolio-infra/PLAN.md`). Every other failure (other 400s, 5xx other than overloaded, timeouts, connection errors, our own abort) keeps the full reservation, which the sweeper later marks charged. This over-counts and never under-counts. Every provider error answers the visitor with the one `unavailable` refusal, the spend cap included: no `error_code` is read, because a provider spend cap is not something a visitor can fix, and the `budget` copy belongs to Packwright's own ledger.
9. **The per-visitor count is taken before the reservation and is not given back** if the budget then refuses. It counts attempts that reached the money step.
10. **Visitor key** (James, 2026-11-19): HMAC-SHA256 keyed by `AUDIT_IP_HASH_KEY` (decision 23) over `ipKeyGenerator(request.ip)`, first 32 hex characters (IPv6 grouped to /56 as `express-rate-limit` does), stored with a TTL so no key outlives two days. Neither a raw IP nor its unkeyed sha256 is ever stored: IPv4 has only about four billion addresses, so an unkeyed hash is reversed by trying them all. Matches Open Door's `SANDBOX_IP_HASH_KEY`.
11. **Ledger storage:** collection `ai_spend` holds one document per UTC month (`_id: '2026-11'`) and per UTC day (`_id: '2026-11-19'`), each the settled-plus-open total; collection `ai_reservations` holds one document per attempt (`open`, `settled`, `charged`) with a 35-day TTL. The month document is guarded too, so the month cannot pass the budget even in a midnight race. The sweeper runs at the start of each reservation (no timers).
12. **Status failures fail closed:** a status that cannot read the ledger or the visitor count answers `available: false, reason: 'budget'`, whose copy says live reads are paused for now. The status has its own per-IP limiter (60 a minute) and is never cached, because the `ip` reason is per visitor. On the page, any status that could not be fetched (a network error or any non-200, the limiter's 429 included) reads as `null` and shows the `unavailable` copy with the sample; until the status has answered, Read stays disabled.
13. **Body limit:** `AUDIT_BODY_LIMIT` from 10 MB to 6 MB, `MAX_PHOTO_BASE64` from 8 MiB to 5 MiB (a 2576 px JPEG at quality 0.92 is well under it). The Docker `CMD` adds `--max-old-space-size=512` under the 768 MiB container limit.
14. **Saved-label list:** the server's `ids` list cap is decoupled from `LABEL_CAP` and stays at 200 (`MAX_IDS_PER_LIST`); 1,000 ids would make a URL of about 25 KB, past Node's 16 KB header limit. The 64 KB per-label limit is checked on the validated document (`413`) rather than by a second body parser.
15. **`/design` is hidden by a build flag,** `VITE_DESIGN_CATALOG=true`, on in the dev server and in the Playwright build only. Production builds drop the route, the masthead link and the `routes.json` entry, so the server 404s it.
16. **Liveness path is `/health/live`.** `/health` stays the deep readiness check.
17. **`/audit?sample=1` loads the sample on arrival,** so the landing page's "Try the sample label" is one click into sample data.
18. **No privacy page exists,** so the processors and retention copy goes in two short notes: on `/audit` (photo reads, bot check, logs, and MongoDB Atlas, which holds the per-network count and the budget ledger) and on `/labels` (7 days, MongoDB Atlas, AWS).
19. **CI pins reuse Open Door's vetted SHAs** (`actions/checkout` v7.0.1, `actions/setup-node` v7.1.0, `actions/upload-artifact` v7.0.2), a major bump from v5 and v4.
20. **Em dashes are replaced in `apps/web` templates, visitor-visible strings in `apps/web/src`, `index.html`, and server error strings that reach the page.** `packages/label-core` (finding text, regulatory tables) and code comments are left alone: changing regulatory text is forbidden, and rule text triggers the `high` review ladder.
21. **Local production run:** a `prod` profile on the existing `docker-compose.yml` (`docker compose --profile prod up`), so a plain `docker compose up -d` still starts only Mongo. It uses its own database, `packwright_prodlike`, so the new 7-day TTL index is built fresh rather than colliding with the development database's 30-day one.
22. **Cloudflare's test keys** (James, 2026-11-19). `siteverify` answers Cloudflare's test secrets itself, with no network call: the always-pass secret `1x0000000000000000000000000000000AA` gives `passed`, the always-fail secret `2x0000000000000000000000000000000AA` gives `failed`. Production (`NODE_ENV=production`) refuses the test site key `1x00000000000000000000AA` or either test secret **unless every `TURNSTILE_HOSTNAMES` entry is `localhost` or `127.0.0.1`**, so the local production-like compose stack (Task 8, Task 18) still starts while a deployed host cannot run on keys that pass every visitor. The controller records this in the spec's decisions log; this plan does not edit the spec.
23. **New setting `AUDIT_IP_HASH_KEY`** (James, 2026-11-19): the HMAC key of decision 10, at least 32 characters, required whenever `AUDIT_PUBLIC` is true, in any environment. The compose `prod` profile carries a fixed local dummy, commented as local only; the real value goes into SSM in Phase 3.

## Review Focus

1. **A visitor closes the tab mid-read.** The call must stop and the reservation must stay counted until the sweeper marks it charged. Test: Task 5, "a visitor who leaves mid-read stops the call, and the reservation stays counted".
2. **A read that starts before UTC midnight on the last day of a month and settles after it.** It must settle into the day and month it began in, and the new month must start from zero. Test: Task 4, "a read that crosses midnight at the end of a month settles into the month it began in".
3. **A double click, two tabs, or a token used twice.** Turnstile tokens are single use; the page must reset the widget after every attempt and never send a token twice, and the server must refuse a reused one with the bot-check copy. Tests: Task 6, "a token siteverify calls a duplicate fails"; Task 9, "resets the bot check after every attempt, so no token is sent twice".
4. **Many visitors racing for the last room of the day.** Reservations must never pass the day's allowance or the month's budget. Test: Task 4, "ten reservations at once never pass the day or the month".
5. **A hiring team behind one office IP uses the 5 reads.** Everyone on that network gets the friendly per-network copy and a working sample, not an error. Tests: Task 8, "status says ip once this address has used its reads"; Task 9, "hides the bot check and the read button when no read is possible, and offers the sample" (reason `ip`).

## File map

- `.dockerignore`, `Dockerfile`, `scripts/verify-image.sh` (create): the image and its checks.
- `docker-compose.yml` (modify): adds the `app` service under the `prod` profile.
- `apps/api/src/audit/extract.ts` (modify): usage on readings and errors, retries off, 60 s, abort signal, reservation constant, and `liveExtractor(apiKey)`, the production composition `server.ts` uses.
- `apps/api/src/audit/pricing.ts` (create): prices, cost and reservation in micro-dollars.
- `apps/api/src/audit/ledger.ts` (create): pacing and the reserve, settle and sweep algorithm over a store; the memory store.
- `apps/api/src/audit/ledgerStore.ts` (create): the Mongo store (`ai_spend`, `ai_reservations`).
- `apps/api/src/audit/spend.ts` (create): `metered()`, `SpendRefused`, `knownUnbilled()`.
- `apps/api/src/audit/turnstile.ts` (create): siteverify with hostname and action, failing closed.
- `apps/api/src/audit/visitorAllowance.ts` (create): per-visitor daily reads in Mongo; replaces `dailyAllowance.ts` (deleted in Task 8).
- `apps/api/src/audit/refusals.ts` (create): refusal reasons, statuses and server copy.
- `apps/api/src/audit/routes.ts`, `apps/api/src/app.ts`, `apps/api/src/env.ts`, `apps/api/src/server.ts` (modify): wiring.
- `apps/api/src/httpServer.ts` (create): keep-alive and graceful stop.
- `apps/web/src/audit/turnstile.ts`, `apps/web/src/audit/refusalCopy.ts`, `apps/web/src/designCatalog.ts` (create).
- `apps/web/src/api/audit.ts`, `apps/web/src/views/AuditView.vue`, `apps/web/src/views/LandingView.vue`, `apps/web/src/views/LabelsView.vue`, `apps/web/src/views/EditorView.vue`, `apps/web/src/router/*`, `apps/web/src/components/SiteHeader.vue`, `apps/web/index.html` (modify).
- `.github/workflows/ci.yml` (modify), `.github/workflows/security.yml` (create). No `dependabot.yml` (James, 2026-11-19: security fixes only, through the GitHub setting in master plan Phase 0).
- Docs: `docs/SOURCES.md` (Tasks 4 to 6), `docs/DESIGN.md`, `docs/security-review-2026-10-18.md`, `docs/BACKLOG.md`, `README.md`, `docs/USE-FROM-YOUR-AI.md`, `docs/plans/2026-10-08-road-to-deployment.md`, `apps/api/.env.example`, `CHANGELOG.md`.

---

### Task 1: Work branch and this plan

**Files:**
- Create: `docs/plans/2026-11-19-portfolio-demo-readiness.md` (this file, already written)
- Modify: `CHANGELOG.md`

**Interfaces:** none.

- [x] **Step 1: Confirm the starting point**

Run: `git status --short && git rev-parse --abbrev-ref HEAD && git rev-parse --short HEAD && git rev-parse dev origin/dev`
Expected: only `?? docs/plans/2026-11-19-portfolio-demo-readiness.md`; branch `dev`; `553a7cd`; the two `rev-parse` hashes equal. Anything else: stop and tell James.

- [x] **Step 2: Create the work branch**

Stop: show the command and wait for James's explicit OK before creating the branch. Then run `git switch -c feat/portfolio-demo-readiness`.

- [x] **Step 3: Add the CHANGELOG entry**

Under `## [Unreleased]`, add an `### Added` bullet: "**The plan for Packwright's public portfolio demo** (`docs/plans/2026-11-19-portfolio-demo-readiness.md`): the production image, a paced AI budget, public photo reads behind a bot check, and the local checks that precede deployment." No em dashes.

- [x] **Step 4: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add docs/plans/2026-11-19-portfolio-demo-readiness.md CHANGELOG.md
git commit -m "docs: plan Packwright's portfolio demo readiness"
```

---

### Task 2: Keep secrets out of the production image

**Files:**
- Create: `.dockerignore`, `Dockerfile`, `scripts/verify-image.sh`
- Modify: `package.json` (script `verify:image`), `docker-compose.yml`, `CHANGELOG.md`

**Interfaces:**
- Produces: image tag `packwright:local`; `npm run verify:image` (env `IMAGE`, default `packwright:local`; `PLATFORM`, default `linux/amd64`); compose service `app` under profile `prod`, published on `127.0.0.1:8080`.

- [x] **Step 1: Write the image check first** (`scripts/verify-image.sh`, `set -euo pipefail`, a `fail()` that prints the container log tail, a `trap` that removes everything it started)

It builds `docker build --platform "$PLATFORM" -t "$IMAGE" .` and then fails unless all of these hold:
1. `docker run --rm --entrypoint sh "$IMAGE" -c 'find / -name ".env*" -not -path "/proc/*" 2>/dev/null'` prints nothing.
2. `docker run --rm --entrypoint id "$IMAGE" -u` is not `0`.
3. `docker run --rm --entrypoint node "$IMAGE" -p 'process.env.NODE_ENV + " " + process.versions.node.split(".")[0]'` prints `production 24`, and `npm --version` in the image starts with `11.` or higher.
4. `grep -rlE 'sk-ant-|1x00000000000000000000AA' /app/apps/api/dist/public` inside the image finds nothing (no key or site key baked into the client).
5. On a throwaway network, `mongo:8` plus the image run with `--read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges -e MONGODB_URI=mongodb://<mongo-name>:27017/packwright -p 127.0.0.1::3000`; within 60 s `GET /health` is 200; `GET /` contains `<div id="app">`; `POST /api/labels/upc-a/export` with `{"gtin":"036000291452"}` returns a body starting `%PDF-`.

Add `"verify:image": "bash scripts/verify-image.sh"` to the root `package.json`.

- [x] **Step 2: Run it to see it fail**

Run: `npm run verify:image`
Expected: FAIL at the build (no `Dockerfile`).

- [x] **Step 3: Write `.dockerignore`**

```
# Secrets first. apps/api/.env holds a real key, and dotenv reads .env from the working directory.
**/.env*
!**/.env.example
.git
.github
**/node_modules
**/dist
**/coverage
**/*.tsbuildinfo
**/.DS_Store
test-results
playwright-report
blob-report
label.pdf
print-test-sheet*.pdf
Cd-response
docs
e2e
.superpowers
```
Keep `assets/` (tsup copies `assets/fonts/ttf` into the bundle) and `scripts/`.

- [x] **Step 4: Write the `Dockerfile`**

Pin `node:24-slim` by tag and digest: run `docker pull node:24-slim` and `docker inspect --format '{{index .RepoDigests 0}}' node:24-slim`, and record the date in a comment (Open Door pinned `sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9` on 2026-11-10; use whatever is current). The layout:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-slim@sha256:<digest> AS build
WORKDIR /app
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/label-core/package.json packages/label-core/
RUN npm ci
COPY . .
# The root build: the web app first, then tsup copies web/dist into api/dist/public and the fonts into api/dist.
RUN npm run build && npm prune --omit=dev

FROM node:24-slim@sha256:<digest>
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/package.json apps/web/
COPY --from=build /app/packages/label-core/package.json packages/label-core/
USER node
EXPOSE 3000
CMD ["node", "--enable-source-maps", "--max-old-space-size=512", "apps/api/dist/server.js"]
```
Comments in the file say why: the bundle imports express, mongoose, pdfkit and the rest from `node_modules` at run time (only `label-core` is bundled, `apps/api/tsup.config.ts:15-18`); the workspace `package.json` files keep `node_modules/@packwright/*` links valid; files stay owned by root so the app cannot rewrite itself; exec-form `CMD` so `node` is PID 1 and receives SIGTERM.

Changed after the independent review of PR #121 (2026-11-21): `npm prune --omit=dev` kept the web workspace's run-time dependencies (vue, pinia, zxing-wasm, barcode-detector), which the server never loads. A third stage, `deps`, now runs `npm ci --omit=dev --omit=optional --workspace=@packwright/api --include-workspace-root=false` from the manifests alone (`--omit=optional` because the lockfile marks tsx, typescript, esbuild and rollup `devOptional`, which `--omit=dev` alone keeps; nothing the bundle imports is optional), and the final stage takes `node_modules` and the api and label-core `package.json` files from it, and only `apps/api/dist` from `build`. `apps/web/package.json` is no longer copied, since there is no `@packwright/web` link to keep valid. `verify-image.sh` gains check 4b, which fails if `node_modules` holds vue, vue-router, pinia, zxing-wasm, barcode-detector, vite, typescript, tsx, esbuild or rollup; the old Dockerfile fails it, and so does the new one without `--omit=optional`.

- [x] **Step 5: Add the `prod` profile to `docker-compose.yml`**

```yaml
  app:
    profiles: ['prod']
    build: .
    image: packwright:local
    platform: linux/amd64
    depends_on: [mongo]
    ports:
      - '127.0.0.1:8080:3000'
    environment:
      MONGODB_URI: mongodb://mongo:27017/packwright_prodlike
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: ['no-new-privileges:true']
    mem_limit: 768m
    stop_grace_period: 30s
```
Update the file's header comment: `docker compose up -d` still starts only Mongo; `docker compose --profile prod up -d --build` adds the production image, on its own database so its indexes are built fresh.

- [x] **Step 6: Run the image check**

Run: `npm run verify:image`
Expected: PASS. On Apple silicon the amd64 build runs under emulation and can take several minutes; `PLATFORM=linux/arm64 npm run verify:image` is a faster smoke check, but the final verification (Task 18) uses amd64. If check 1 lists a file inside `node_modules`, stop and show James: do not widen the check.

- [x] **Step 7: Mutation test**

Remove the `**/.env*` line, create a throwaway `apps/api/.env.verify-probe` containing `X=1`, run check 1 only (`docker build` then the `find`): it must list the probe. Restore the line, delete the probe, re-run `npm run verify:image`: PASS.

- [x] **Step 8: Checks and CHANGELOG**

Run: `npm run format:check && npm run lint`. Expected: PASS. Add a CHANGELOG `### Added` bullet: the production image, its `.dockerignore`, `npm run verify:image`, and the compose `prod` profile.

- [x] **Step 9: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add .dockerignore Dockerfile scripts/verify-image.sh package.json docker-compose.yml CHANGELOG.md
git commit -m "build: add the production image, with every .env kept out of it"
```

---

### Task 3: Metered extraction: usage on every reading, no SDK retries, 60 s, abort signal

**Files:**
- Modify: `apps/api/src/audit/extract.ts`, `apps/api/src/audit/extract.test.ts`, `apps/api/src/audit/sampleReading.ts`, `apps/api/src/audit/routes.test.ts` (fake readings gain `billed`), `CHANGELOG.md`

**Interfaces:**
- Produces (in `extract.ts`):
  - `export interface Billed { model: string; usage: Anthropic.Usage }`
  - `export interface MeteredReading extends LabelReading { billed: Billed }`
  - `export abstract class ExtractionError extends Error { billed: Billed | undefined }`; `ExtractionDeclined`, `ExtractionTruncated`, `ExtractionUnreadable` extend it (constructors unchanged).
  - `export interface CallOptions { signal?: AbortSignal | undefined }`
  - `export type SendMessage = (params: Anthropic.MessageCreateParamsNonStreaming, options?: CallOptions) => Promise<Anthropic.Message>`
  - `export type ExtractLabel = (photo: LabelPhoto, regime: GhsRegime, options?: CallOptions) => Promise<MeteredReading>`
  - `extractGhsLabel(send, photo, regime, options?: CallOptions): Promise<MeteredReading>`
  - `VISION_TIMEOUT_MS = 60_000`, `VISION_MAX_RETRIES = 0`, `SLOWEST_TOKENS_PER_SECOND = 70`, `VISION_MAX_TOKENS = 4_000` (unchanged)

- [x] **Step 1: Write the failing tests** in `extract.test.ts`

```ts
it('is bounded, because somebody is holding a phone through this', async () => {
  // existing body, with:
  expect(client.timeout).toBe(60_000)
  expect(client.maxRetries).toBe(0)
  expect(VISION_TIMEOUT_MS).toBeLessThan(120_000) // the load balancer's idle timeout
})

describe('what a reading was billed for', () => {
  it('comes back with every reading', async () => {
    const reading = await extractGhsLabel(replying(recorded), PHOTO, 'eu-clp')
    expect(reading.billed).toEqual({ model: recorded.model, usage: recorded.usage })
  })
  it.each([
    ['a decline', refused],
    ['a reply cut short', truncated],            // the existing max_tokens fixture
    ['prose where JSON was asked for', notJson], // the existing unparseable fixture
  ])('comes back with %s, which is billed too', async (_, message) => {
    await expect(extractGhsLabel(replying(message), PHOTO, 'eu-clp')).rejects.toMatchObject({
      billed: { model: message.model, usage: message.usage },
    })
  })
})

it("passes the caller's abort signal to the port", async () => {
  const send = vi.fn().mockResolvedValue(recorded)
  const signal = new AbortController().signal
  await extractGhsLabel(send, PHOTO, 'eu-clp', { signal })
  expect(send).toHaveBeenCalledWith(expect.anything(), { signal })
})

it('hands the signal to the SDK', async () => {
  const create = vi.fn().mockResolvedValue(recorded)
  const signal = new AbortController().signal
  await sendThrough({ messages: { create } } as unknown as Anthropic)(PARAMS, { signal })
  expect(create).toHaveBeenCalledWith(PARAMS, { signal })
})
```
`refused`, `truncated` and `notJson` are the names `fixtures/responses.ts` already exports. `extract.test.ts` has no `PARAMS` today: define it in the test file as a minimal `Anthropic.MessageCreateParamsNonStreaming` (`{ model: 'claude-opus-5-5', max_tokens: 1, messages: [{ role: 'user', content: 'x' }] }`), used only by "hands the signal to the SDK". Update the coherence test's comment with the four points of decision 6: the floor of 70 rests on one timed call (416 tokens in 4.7 s, 2026-11-18, about 88 a second); a whole-call rate includes the time to the first token, so it understates the generation rate; a slower 4,000-token read times out and keeps its full reservation (over-counted, never under-counted); measuring more needs paid calls, ruled out before launch.

- [x] **Step 2: Run them to see them fail**

Run: `npx vitest run apps/api/src/audit/extract.test.ts`
Expected: FAIL (`timeout` is 120000, `billed` undefined, the port called with one argument).

- [x] **Step 3: Implement** in `extract.ts`

`extractGhsLabel` wraps everything after `send` returns in `try { ... } catch (error) { if (error instanceof ExtractionError) error.billed = billed; throw error }`, where `billed = { model: response.model, usage: response.usage }`, and returns `{ extraction, model: response.model, billed }`. `sendThrough(client)` returns `(params, options) => client.messages.create(params, options)`. Rewrite the `VISION_TIMEOUT_MS` note: one attempt, below the load balancer's 120 s idle timeout, no SDK retries because each attempt must carry its own reservation (spec 5.2). Rewrite the `SLOWEST_TOKENS_PER_SECOND` note (it says "Measured on Opus 5" today) with the same four points as the coherence test's comment: one timed call, 416 tokens in 4.7 s on 2026-11-18; a whole-call rate includes the time to the first token and so understates the generation rate; a slower 4,000-token read times out and keeps its full reservation, so it is over-counted and never under-counted; measuring more needs paid calls, which are ruled out before launch. `replaySampleReading()` in `sampleReading.ts` returns only `{ extraction, model }` so the committed `sampleReading.json` still equals it. In `routes.test.ts`, the `READING` fake gains `billed: { model: 'claude-opus-5-5', usage: recorded.usage }`.

- [x] **Step 4: Run the tests**

Run: `npx vitest run apps/api/src/audit`
Expected: PASS, `sampleReading.test.ts` included.

- [x] **Step 5: Mutation test**

Set `VISION_MAX_RETRIES` back to 1: "is bounded" fails. Remove the `billed` assignment in the catch: the `it.each` fails. Restore both.

- [x] **Step 6: Checks and CHANGELOG**

Run: `npm run lint && npm run typecheck && npm test`. Expected: PASS. CHANGELOG `### Changed`: one attempt per read (no SDK retry, which billed a read twice), 60 s timeout below the load balancer's 120 s, the floor at 70 tokens a second, and readings and their errors carry what they were billed.

- [x] **Step 7: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git commit -am "feat(api): one billed attempt per read, with its usage carried out"
```

---

### Task 4: The spend ledger: prices, pacing, reserve, settle, sweep

**Files:**
- Create: `apps/api/src/audit/pricing.ts`, `pricing.test.ts`, `ledger.ts`, `ledger.test.ts`, `ledgerStore.ts`, `ledgerStore.test.ts`
- Modify: `apps/api/src/audit/extract.ts` (reservation constants), `extract.test.ts`, `docs/SOURCES.md` (Anthropic's pricing and vision pages, first read here), `CHANGELOG.md`

**Interfaces:**
- Consumes: `EXTRACTION_MODEL`, `VISION_MAX_TOKENS` (Task 3).
- Produces, `pricing.ts`:
  - `export interface TokenPrice { inputUsdPerMTok: number; cacheWriteUsdPerMTok: number; cacheReadUsdPerMTok: number; outputUsdPerMTok: number }`
  - `export const PRICES: Readonly<Record<string, TokenPrice>>` with only `'claude-opus-5-5': { inputUsdPerMTok: 4, cacheWriteUsdPerMTok: 5, cacheReadUsdPerMTok: 0.2, outputUsdPerMTok: 20 }` (source: Anthropic's pricing page, read on the day and dated in the note; cross-check `open-door/apps/api/app/ai/pricing.py`, which recorded the same $0.20 cache read from that page; if the page disagrees with the master plan's price table, stop and tell James). The vision request asks for no prompt caching, so `costMicros` returns `undefined` (and the read settles at the full reservation) for a reply that reports 1-hour cache writes (`usage.cache_creation.ephemeral_1h_input_tokens` above 0), rather than pricing them at a rate nobody pinned; add a test row for it
  - `export function costMicros(model: string, usage: Anthropic.Usage): number | undefined` (rounded up; `undefined` for an unpriced model; null cache fields count 0)
  - `export function reservationMicros(model: string, inputTokens: number, maxTokens: number): number` (input at the input rate, output at the output rate, rounded up; throws for an unpriced model)
  - `export const usdToMicros = (usd: number): number => Math.round(usd * 1_000_000)`
- Produces, `extract.ts`: `MAX_IMAGE_TOKENS = 4_784`, `VISION_INPUT_TOKEN_BOUND = 8_000`, `VISION_RESERVATION_MICROS = reservationMicros(EXTRACTION_MODEL, VISION_INPUT_TOKEN_BOUND, VISION_MAX_TOKENS)` (112,000).
- Produces, `ledger.ts`:
  - `export interface BudgetConfig { monthlyBudgetMicros: number; pacingMultiplier: number; dailyFloorMicros: number }`
  - `export const utcDay = (now: Date): string` (`YYYY-MM-DD`), `export const utcMonth = (now: Date): string` (`YYYY-MM`)
  - `export function allowanceTodayMicros(config: BudgetConfig, spentBeforeTodayMicros: number, now: Date): number`
  - `export interface Reservation { id: string; day: string; micros: number }`
  - `export interface LedgerStore { totals(periods: readonly string[]): Promise<Record<string, number>>; addWithin(period: string, micros: number, ceilingMicros: number): Promise<boolean>; add(periods: readonly string[], micros: number): Promise<void>; openReservation(day: string, micros: number, at: Date): Promise<string>; closeReservation(id: string, actualMicros: number, at: Date): Promise<boolean>; chargeStale(before: Date): Promise<number> }`. `totals` returns a key for every requested period, 0 for a period with no document, in both stores, so `reserve` never subtracts `undefined`.
  - `export interface SpendLedger { reserve(micros: number): Promise<Reservation | undefined>; settle(reservation: Reservation, actualMicros: number): Promise<void>; roomTodayMicros(): Promise<number> }`
  - `export const STALE_RESERVATION_MS = 10 * 60_000`
  - `export function createLedger(store: LedgerStore, config: BudgetConfig, now?: () => Date): SpendLedger`
  - `export function memoryLedgerStore(): LedgerStore`
- Produces, `ledgerStore.ts`: `export function mongoLedgerStore(): LedgerStore`; models `AiSpend` (collection `ai_spend`: `_id: string`, `micros: number`) and `AiReservation` (collection `ai_reservations`: `day`, `micros`, `state: 'open' | 'settled' | 'charged'`, `actualMicros?`, `createdAt`, `closedAt?`; indexes `{ state: 1, createdAt: 1 }` and a TTL of 35 days on `createdAt`).

- [x] **Step 1: Write the failing pricing tests** (`pricing.test.ts`; vectors worked by hand from the published prices)

```ts
it('prices the recorded reading at list price', () => {
  // 2,537 input x 4 + 488 output x 20 = 10,148 + 9,760
  expect(costMicros('claude-opus-5-5', recorded.usage)).toBe(19_908)
})
it('rounds a fraction of a micro-dollar up', () => {
  // 1,000 x 4 + 3 cache reads x 0.2 = 4,000.6
  expect(costMicros('claude-opus-5-5', usage({ input_tokens: 1_000, cache_read_input_tokens: 3 }))).toBe(4_001)
})
it('has no price for a model nobody pinned', () => {
  expect(costMicros('claude-unknown', recorded.usage)).toBeUndefined()
})
it("reserves a read's worst case", () => {
  // 8,000 x 4 + 4,000 x 20
  expect(reservationMicros('claude-opus-5-5', 8_000, 4_000)).toBe(112_000)
  expect(VISION_RESERVATION_MICROS).toBe(112_000)
})
it('bounds the input by the largest image plus what the recorded request spent besides its image', () => {
  // sampleLabel.png is 760 x 620. Anthropic's vision page (read on 2026-11-19) prices an
  // image at ceil(width / 28) x ceil(height / 28) tokens: 28 x 23 = 644.
  const recordedImageTokens = Math.ceil(760 / 28) * Math.ceil(620 / 28)
  expect(recordedImageTokens).toBe(644)
  // 4,784 + (2,537 - 644) = 4,784 + 1,893 = 6,677
  expect(VISION_INPUT_TOKEN_BOUND).toBeGreaterThanOrEqual(
    MAX_IMAGE_TOKENS + recorded.usage.input_tokens - recordedImageTokens,
  )
})
```
Before writing `MAX_IMAGE_TOKENS`, read Anthropic's vision page and record the cap, the 28 px patch formula and the date beside it (the `VISION_INPUT_TOKEN_BOUND` note gives the sum of decision 5: 4,784 + 1,893 = 6,677, rounded up to 8,000); if the documented cap is above 4,784, raise both constants accordingly. Read Anthropic's pricing page for `PRICES` the same way. Both pages are read for the first time here: add their lines to `docs/SOURCES.md` under "The photo audit".

- [x] **Step 2: Write the failing ledger tests** (`ledger.test.ts`, memory store, fixed clock; `$10 = 10_000_000`, floor `500_000`, multiplier 3)

Pacing vectors, worked by hand:

| `now` | spent before today | expected `allowanceTodayMicros` |
|---|---|---|
| 2026-11-01 | 0 | 1,000,000 (3 x 10,000,000 / 30) |
| 2026-11-19 | 6,000,000 | 1,000,000 (3 x 4,000,000 / 12) |
| 2026-11-19 | 9,000,000 | 500,000 (3 x 1,000,000 / 12 = 250,000; the floor wins) |
| 2026-11-30 | 9,800,000 | 200,000 (left caps it) |
| 2026-12-01 | 0 | 967,741 (3 x 10,000,000 / 31, rounded down) |
| 2024-02-29 | 0 | 10,000,000 (one day left; left caps it) |
| any | budget 0 | 0 |
| any | 11,000,000 (overspent) | 0 |

Behavior tests:
- `'refuses every reservation when the budget is zero'`: `reserve(112_000)` is `undefined`.
- `'admits reservations until the day is full, then refuses'`: at 2026-11-19, seeded with `store.add(['2026-11', '2026-11-05'], 9_000_000)` (allowance 500,000), four reserves of 112,000 succeed and the fifth is `undefined`.
- `'settling gives back what a read did not spend'`: reserve 112,000, settle at 19,908; `roomTodayMicros()` goes from `allowance - 112_000` to `allowance - 19_908`.
- `'settles once'`: a second `settle` of the same reservation changes nothing.
- `'a reservation older than ten minutes is charged at what was reserved'`: reserve 112,000 at T; at T + 11 min `reserve(Number.MAX_SAFE_INTEGER)` sweeps it and is itself refused (`undefined`), so it adds nothing; a late `settle(r, 0)` then changes nothing, so the day still counts 112,000.
- `'a read that crosses midnight at the end of a month settles into the month it began in'` (Review Focus 2): reserve at `2026-11-30T23:59:59Z`, settle 20,000 at `2026-12-01T00:00:01Z`; `store.totals(['2026-11', '2026-11-30', '2026-12'])` equals `{ '2026-11': 20_000, '2026-11-30': 20_000, '2026-12': 0 }`; `roomTodayMicros()` on Dec 1 is 967,741.
- `'holds the month even when its totals were read before another reservation landed'`: the pacing alone already keeps a day inside the month, so the month guard matters only in a race, and the test builds one. Budget 300,000, floor 1,000,000, clock 2026-11-19; seed `store.add(['2026-11', '2026-11-18'], 200_000)`; wrap the memory store so `totals` reports the month 200,000 lower than it is (a reservation dated yesterday that landed after the read). `reserve(112_000)` must be `undefined`, and the month total must stay 200,000.

- [x] **Step 3: Write the failing Mongo store tests** (`ledgerStore.test.ts`, `withDatabase()`)

- `'adds within a ceiling, and refuses past it'`: `addWithin('2026-11-19', 100, 250)` true twice, false the third time; `totals` shows 200.
- `'reports 0 for a period it has never seen'`: on an empty store, `totals(['2026-11', '2026-11-19'])` equals `{ '2026-11': 0, '2026-11-19': 0 }`.
- `'ten reservations at once never pass the day or the month'` (Review Focus 4): `const store = mongoLedgerStore()`, seeded as the memory test is with `store.add(['2026-11', '2026-11-05'], 9_000_000)`; `createLedger(store, { monthlyBudgetMicros: 10_000_000, pacingMultiplier: 3, dailyFloorMicros: 500_000 }, () => new Date('2026-11-19T12:00:00Z'))`, which gives an allowance of 500,000; `Promise.all` of ten `reserve(112_000)` admits exactly 4; the day total is 448,000; `ai_reservations` holds 4 open documents.
- `'closes a reservation once'`: `closeReservation` true, then false.
- `'charges only stale open reservations'`: one opened at T, one at T + 11 min; `chargeStale(T + 10 min)` returns 1, and only the first is `charged`.

- [x] **Step 4: Run them to see them fail**

Run: `npx vitest run apps/api/src/audit/pricing.test.ts apps/api/src/audit/ledger.test.ts apps/api/src/audit/ledgerStore.test.ts`
Expected: FAIL (modules missing).

- [x] **Step 5: Implement**

`allowanceTodayMicros`: `left = max(0, budget - spentBefore)`; `daysLeft = daysInUtcMonth(now) - now.getUTCDate() + 1` with `daysInUtcMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()`; return `Math.min(left, Math.max(Math.floor((multiplier * left) / daysLeft), floor))`.

`createLedger` algorithm:

```
reserve(micros):
  t = now(); await store.chargeStale(t - STALE_RESERVATION_MS)
  day = utcDay(t); month = utcMonth(t)
  totals = await store.totals([month, day])
  allowance = allowanceTodayMicros(config, totals[month] - totals[day], t)
  if micros > allowance: return undefined
  if !(await store.addWithin(month, micros, config.monthlyBudgetMicros)): return undefined
  if !(await store.addWithin(day, micros, allowance)):
    await store.add([month], -micros); return undefined
  id = await store.openReservation(day, micros, t)
  return { id, day, micros }

settle(r, actual):
  if !(await store.closeReservation(r.id, actual, now())): return   // already settled or charged
  await store.add([r.day, r.day.slice(0, 7)], actual - r.micros)       // log a warning when actual > r.micros

roomTodayMicros():
  same totals and allowance as reserve; return max(0, allowance - totals[day])
```
Memory store: `Map`s, synchronous bodies behind `async`. In both stores `totals` fills every requested period, 0 where there is no entry or document. Mongo store: `addWithin` first upserts `{ $setOnInsert: { micros: 0 } }` with an equality filter (Mongo retries that race itself), then `updateOne({ _id, micros: { $lte: ceiling - micros } }, { $inc: { micros } })` and returns `modifiedCount === 1` (false at once when `ceiling - micros < 0`); `closeReservation` is `updateOne({ _id, state: 'open' }, { $set: { state: 'settled', actualMicros, closedAt } })`; `chargeStale` is `updateMany({ state: 'open', createdAt: { $lt: before } }, { $set: { state: 'charged', closedAt: before } })`. Module notes say why: no lock is held across the model call, open reservations already count at their full amount, and a crash between two updates over-counts, never under-counts.

- [x] **Step 6: Run the tests**

Run: `npx vitest run apps/api/src/audit`
Expected: PASS.

- [x] **Step 7: Mutation test**

Drop the month `addWithin`: "holds the month even when its totals were read before another reservation landed" fails. Replace the guarded `$inc` with a plain one: "ten reservations at once" fails. Remove `chargeStale`: the stale test fails. Make the Mongo `totals` return only the periods it found: "reports 0 for a period it has never seen" fails. Restore all four.

- [x] **Step 8: Checks and CHANGELOG**

Run: `npm run lint && npm run typecheck && npm test`. Expected: PASS. CHANGELOG `### Added`: the ledger, with the pacing formula and the worst case of $0.112 a read.

- [x] **Step 9: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add apps/api/src/audit docs/SOURCES.md CHANGELOG.md
git commit -m "feat(api): a paced spend ledger in micro-dollars"
```

---

### Task 5: Every live read goes through the ledger

**Files:**
- Create: `apps/api/src/audit/spend.ts`, `apps/api/src/audit/spend.test.ts`
- Modify: `apps/api/src/audit/extract.ts` (`liveExtractor`), `apps/api/src/audit/extract.test.ts`, `apps/api/src/audit/routes.ts`, `routes.test.ts`, `apps/api/src/app.ts`, `apps/api/src/env.ts`, `env.test.ts`, `apps/api/src/server.ts`, `apps/api/.env.example`, `playwright.config.ts`, `docs/SOURCES.md` (Anthropic's errors page, first read here), `CHANGELOG.md`

**Interfaces:**
- Consumes: `ExtractLabel`, `ExtractionError`, `MeteredReading`, `sendThrough`, `visionClient`, `extractGhsLabel` (Task 3); `SpendLedger`, `costMicros`, `VISION_RESERVATION_MICROS` (Task 4).
- Produces, `extract.ts`: `export function liveExtractor(apiKey: string): ExtractLabel`, the production composition: `sendThrough(visionClient(apiKey))` (the client with the 60 s timeout and no retries), returning `(photo, regime, options) => extractGhsLabel(send, photo, regime, options)`. Today `server.ts:38-45` builds `(photo, regime) => extractGhsLabel(send, photo, regime)`, which drops `options`, and nothing imports `server.ts`, so the signal would pass every test and never reach the SDK in production.
- Produces, `spend.ts`:
  - `export class SpendRefused extends Error`
  - `export class SpendUnavailable extends Error` (the ledger store threw while reserving; `cause` holds its error)
  - `export function knownUnbilled(error: unknown): boolean`
  - `export function metered(extract: ExtractLabel, ledger: SpendLedger, reservationMicros: number): ExtractLabel`
- Produces, `routes.ts`: `export interface AuditSpend { ledger: SpendLedger; reservationMicros: number }`; `AuditRouterOptions.spend?: AuditSpend`. Produces, `app.ts`: `AppOptions.auditSpend?: AuditSpend`.
- Produces, `env.ts`: `AI_MONTHLY_BUDGET_USD?: number` (optional; 0 to 1,000, up to six decimals), `AI_PACING_MULTIPLIER: number` (default 3, 1 to 31), `AI_DAILY_FLOOR_USD: number` (default 0.5, 0 to 1,000).

- [x] **Step 1: Write the failing `spend.test.ts`**

Build SDK errors the way the SDK does: `Anthropic.APIError.generate(status, { type: 'error', error: { type, message, details } }, undefined, new Headers())`. Read Anthropic's errors page first and record the usage-limit wording, the credit-balance-too-low wording and the date in the `knownUnbilled` note; the page is read for the first time here, so add its line to `docs/SOURCES.md` under "The photo audit".

```ts
it.each([
  ['a revoked key (401)', apiError(401, 'authentication_error', 'invalid x-api-key')],
  ['a forbidden key (403)', apiError(403, 'permission_error', 'not allowed')],
  ['a billing error (402)', apiError(402, 'billing_error', 'credit balance too low')],
  ['a credit balance too low (400)', apiError(400, 'invalid_request_error', '<the credit-balance wording from the docs>')],
  ['the workspace usage limit (400)', apiError(400, 'invalid_request_error', 'You have reached your specified workspace API usage limits. ...')],
  ['the organization usage limit (400)', apiError(400, 'invalid_request_error', '<the organization wording from the docs>')],
  ['the spend cap (429)', apiError(429, 'rate_limit_error', 'spend limit', { error_code: 'enforced_spend_limit_reached' })],
  ['a plain rate limit (429)', apiError(429, 'rate_limit_error', 'slow down')],
  ['an overload (529)', apiError(529, 'overloaded_error', 'Overloaded')],
])('settles %s at nothing', (_, error) => expect(knownUnbilled(error)).toBe(true))

it.each([
  ['any other bad request', apiError(400, 'invalid_request_error', 'image too large')],
  ['a server error', apiError(500, 'api_error', 'oops')],
  ['a timeout', new Anthropic.APIConnectionTimeoutError()],
  ['our own abort', new Anthropic.APIUserAbortError()],
  ['anything else', new Error('?')],
])('keeps the reservation for %s', (_, error) => expect(knownUnbilled(error)).toBe(false))
```
`metered` tests (memory ledger, budget $10, fixed clock, `room = () => ledger.roomTodayMicros()`):
- `'refuses before calling when the budget has no room'`: budget 0; rejects with `SpendRefused`; the inner extract was not called.
- `'a ledger that cannot reserve is unavailable, not a crash'`: `reserve` rejects; `metered` rejects with `SpendUnavailable`; the inner extract was not called.
- `'settles a reading at what it cost'`: room drops by exactly 19,908.
- `'settles a billed failure at what it cost, then raises it'`: inner rejects with an `ExtractionDeclined` carrying `billed`; `metered` rejects with that same error; room drops by 19,908.
- `'settles a known-unbilled failure at nothing'`: 401; room unchanged.
- `'keeps the whole reservation when the outcome is unknown'`: timeout; room drops by 112,000.
- `'settles a reply from a model with no price at the whole reservation'`: `billed.model: 'claude-unknown'`; room drops by 112,000.
- `'a ledger that cannot settle does not take the reading away'`: `settle` rejects; the reading still resolves, and the failure is logged.
- `'passes the signal through'`: `const signal = new AbortController().signal`; `metered(inner, ledger, 112_000)(PHOTO, 'eu-clp', { signal })`; `inner` was called once with `PHOTO` and `'eu-clp'`, and the `signal` it received is the same object (`expect(inner.mock.calls[0][2]?.signal).toBe(signal)`).

`extract.test.ts`, `'the live extractor hands the caller's signal to the SDK'`: `const create = vi.spyOn(Anthropic.Messages.prototype, 'create').mockResolvedValue(recorded)` (a value import of the SDK, not `import type`; no network is reached); `await liveExtractor('sk-ant-not-a-real-key')(PHOTO, 'eu-clp', { signal })`; `create`'s second argument is `{ signal }` with the same `signal`. Restore the spy in `afterEach` (`mockRestore`).

- [x] **Step 2: Write the failing route and env tests**

`routes.test.ts`, new `describe('what a read may spend')`, app built with `auditSpend: { ledger: createLedger(memoryLedgerStore(), config, clock), reservationMicros: 112_000 }`:
- `'refuses cleanly when the budget is zero'`: budget 0; `POST /api/audit/ghs` with a valid photo answers 429 with `reason: 'budget'` and an `error` naming the sample; extract not called.
- `'says no read is possible when the day has no room'`: budget 0; `GET /api/audit/status` has `available: false`.
- `'a provider limit points at the sample, never at the photo'`: extract rejects with the 400 workspace-limit error: 503, `reason: 'unavailable'`, and `JSON.stringify(body)` does not match `/unreadable|corrupt|try again in a moment/i`. Same for 401, 402, the 400 credit balance, a 429 spend cap, a plain 429, 529, a 500 and a timeout (`it.each`).
- `'a visitor who leaves mid-read stops the call, and the reservation stays counted'` (Review Focus 1): record `before = await roomTodayMicros()`; the fake extract awaits its `signal`'s `abort` event, then rejects with `new Anthropic.APIUserAbortError()` and resolves a `rejected` promise the test holds; the supertest request is aborted after 50 ms. The server's rejection and its (absent) settle run after the client has gone, so the test awaits the handler's completion before asserting: `await vi.waitFor(async () => expect(await roomTodayMicros()).not.toBe(before), { timeout: 2_000 })`, then `await rejected` and one `await new Promise((resolve) => setImmediate(resolve))`, so a settle that would wrongly give the reservation back has had its chance to run. Then assert the signal fired and `roomTodayMicros()` is exactly `before - 112_000`.

Replace the existing 422 "vision service could not process this request" and 502 tests, and `'reports being rate limited as busy rather than as unreachable'` (`routes.test.ts:160`, a 503 with "busy" copy), with the 503 `unavailable` ones; keep the `ExtractionDeclined` and `ExtractionTruncated` 422s. `ExtractionUnreadable`'s 422 `error` becomes `'The reading came back in a form Packwright could not use. Try again, or try the sample label.'`

`env.test.ts`:
- `AI_MONTHLY_BUDGET_USD: '10'` parses to 10, `'0.5'` to 0.5; `'-1'`, `'ten'`, `'1e3'`, `'1001'` throw naming the variable; blank is absent.
- defaults: `AI_PACING_MULTIPLIER` 3, `AI_DAILY_FLOOR_USD` 0.5.
- `'production that can spend the Anthropic key states its budget'`: `{ NODE_ENV: 'production', ANTHROPIC_API_KEY: 'k', AUDIT_API_KEY: 'a' }` throws `/AI_MONTHLY_BUDGET_USD/`; adding `AI_MONTHLY_BUDGET_USD: '0'` parses.

- [x] **Step 3: Run them to see them fail**

Run: `npx vitest run apps/api/src/audit apps/api/src/env.test.ts`
Expected: FAIL.

- [x] **Step 4: Implement**

`knownUnbilled`: true for `AuthenticationError`, `PermissionDeniedError`, any `APIError` with `status === 402`, a `BadRequestError` whose `message` matches `/reached your specified (?:workspace |organization )?API usage limits/i` (adjust to the documented organization wording), any `RateLimitError` (status 429, which includes the spend-cap 429 with `error_code` `enforced_spend_limit_reached` and a plain rate limit: both are rejected before any work is done; shared rule update 2026-11-19 in `portfolio-infra/PLAN.md`), a `BadRequestError` whose message says the credit balance is too low (matched on the errors page's wording, recorded with its date), and any `APIError` with `status === 529` or `type === 'overloaded_error'` (a non-streaming request produced no output). False for everything else. No `error_code` is read anywhere (decision 8): every provider error maps to the one `unavailable` refusal, because a spend cap is not something a visitor can fix and the `budget` copy belongs to the ledger.

`metered(extract, ledger, reservationMicros)`: reserve (or throw `SpendRefused`; a reserve that throws becomes `SpendUnavailable`, logged, and extract is not called); call `extract(photo, regime, options)`; on success settle at `costMicros(billed.model, billed.usage) ?? reservationMicros`; on an `ExtractionError` with `billed`, settle the same way and rethrow; on `knownUnbilled`, settle at 0 and rethrow; otherwise rethrow and leave it open. Every `settle` is awaited inside `try/catch` that logs and swallows.

Route (`routes.ts`): when `spend` is set, wrap `extract` with `metered` once at router creation. In the POST handler: `const abort = new AbortController(); response.on('close', () => { if (!response.writableFinished) abort.abort() })`, then `extract(image, regime, { signal: abort.signal })`; skip writing once `abort.signal.aborted`. Error mapping: `SpendRefused` gives 429 `{ error: 'Live photo reads are paused for now. Try the sample label.', reason: 'budget' }`; every `Anthropic.APIError` (connection, timeout and abort included) gives 503 `{ error: 'Live photo reading is not available right now. Try the sample label.', reason: 'unavailable' }`, the detail going to the log only; `SpendUnavailable` gives the same 503 `unavailable` body. The deployment-wide day count stays where it is for now (Task 8 replaces it). Status: `available` also needs `(await spend.ledger.roomTodayMicros()) >= spend.reservationMicros` when `spend` is set; a ledger that throws reads as not available (logged). Rewrite the `DEFAULT_AUDIT_LIMITS` note's "$0.13 a call" (`routes.ts:85-88`) and `env.ts:129` with the new figures: about $0.02 to $0.04 a typical read, $0.112 at worst.

`env.ts`: a `dollars(name)` helper (digits with up to six decimals, `blankAsAbsent`, `.max(1_000)`); the three settings; the cross-field rule: production with `ANTHROPIC_API_KEY` requires `AI_MONTHLY_BUDGET_USD` ("is required in production when ANTHROPIC_API_KEY is set; 0 turns live reads off").

`extract.ts`: `liveExtractor(apiKey)` as in the interface, with a note saying why it exists (the composition `server.ts` used to build inline dropped `options`, and nothing tests `server.ts`). `app.ts`: pass `auditSpend` to the router. `server.ts`: `const extract = env.ANTHROPIC_API_KEY === undefined ? undefined : liveExtractor(env.ANTHROPIC_API_KEY)`, replacing the inline composition (its comment moves to `liveExtractor`'s note); build `createLedger(mongoLedgerStore(), { monthlyBudgetMicros: usdToMicros(env.AI_MONTHLY_BUDGET_USD ?? 0), pacingMultiplier: env.AI_PACING_MULTIPLIER, dailyFloorMicros: usdToMicros(env.AI_DAILY_FLOOR_USD) })` and pass `auditSpend: { ledger, reservationMicros: VISION_RESERVATION_MICROS }` whenever `extract` exists; log `live photo reads: $<budget> a month (0 means off)`. `.env.example`: the three settings, with "Blank means 0 outside production: live reads off." `playwright.config.ts`: add `AI_MONTHLY_BUDGET_USD=0` to the `webServer` command, so a developer key in the environment can never be spent by the browser suite.

- [x] **Step 5: Run the tests**

Run: `npx vitest run apps/api`
Expected: PASS.

- [x] **Step 6: Mutation test**

Make `knownUnbilled` always return false: the "at nothing" cases fail. Remove the `response.on('close')` hook: the mid-read test fails. Map `BadRequestError` back to 422: the "points at the sample" case fails. Drop `options` in `liveExtractor` (`(photo, regime) => extractGhsLabel(send, photo, regime)`): "the live extractor hands the caller's signal to the SDK" fails. Drop the third argument in `metered`'s call to `extract`: "passes the signal through" fails. Restore all five.

- [x] **Step 7: All checks and CHANGELOG**

Run all checks. Expected: PASS. CHANGELOG `### Changed`: every read is reserved and settled; provider limit, credit and outage errors answer a friendly 503 that points at the sample; a visitor leaving stops the call.

- [x] **Step 8: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add apps/api playwright.config.ts docs/SOURCES.md CHANGELOG.md
git commit -m "feat(api): reserve and settle every live read against a monthly budget"
```

- [x] **Step 9: PR checkpoint (stage boundary: the image and the money)**

Run `git diff --shortstat dev...HEAD` and `/security-review`. Draft the PR (base `dev`): title "The production image and a paced AI budget", body listing Tasks 1 to 5, the review findings left out of scope, and the test plan; suggest `/code-review high <PR#>` once it exists, since a defect here costs money. Stop: wait for James's explicit OK before `git push -u origin feat/portfolio-demo-readiness`. Stop again: wait for his explicit OK before `gh pr create --base dev`. Merging is James's. Continue on this branch; at the next checkpoint, if this PR is still open, ask James whether to wait or to stack.

---

### Task 6: Turnstile verification on the server, and the CSP

**Files:**
- Create: `apps/api/src/audit/turnstile.ts`, `apps/api/src/audit/turnstile.test.ts`
- Modify: `apps/api/src/app.ts` (helmet directives), `apps/api/src/app.test.ts`, `docs/SOURCES.md` (Cloudflare's siteverify and testing pages, first read here), `CHANGELOG.md`

**Interfaces:**
- Produces, `turnstile.ts`:
  - `export const TURNSTILE_HEADER = 'x-turnstile-token'`, `export const TURNSTILE_ACTION = 'audit'`, `export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'`, `export const MAX_TOKEN_LENGTH = 2048`
  - `export const TEST_SITE_KEY = '1x00000000000000000000AA'`, `export const TEST_SECRET_PASSES = '1x0000000000000000000000000000000AA'`, `export const TEST_SECRET_FAILS = '2x0000000000000000000000000000000AA'` (decision 22; Task 8's `env.ts` reads them for the production refusal)
  - `export type TurnstileOutcome = 'passed' | 'failed' | 'unavailable'`
  - `export type VerifyTurnstile = (check: { token: string; remoteIp: string | undefined }) => Promise<TurnstileOutcome>`
  - `export function siteverify(options: { secretKey: string; hostnames: readonly string[]; timeoutMs?: number; fetchImpl?: typeof fetch }): VerifyTurnstile` (timeout default 5,000 ms; a test secret is answered locally, without `fetchImpl`)

- [x] **Step 1: Write the failing tests** (`turnstile.test.ts`; `fetchImpl` is a `vi.fn`, Cloudflare is never called)

- `'passes a token Cloudflare accepts for this host and action'`: reply `{ success: true, hostname: 'packwright.example', action: 'audit' }` gives `'passed'`; the request was a POST to `SITEVERIFY_URL` carrying `secret`, `response` and `remoteip`.
- `'fails a token for another host'` (`hostname: 'opendoor.example'`), `'fails a token for another action'` (`action: 'sandbox'`), `'fails a refused token'` (`success: false, 'error-codes': ['invalid-input-response']`).
- `'a token siteverify calls a duplicate fails'` (Review Focus 3): `success: false, 'error-codes': ['timeout-or-duplicate']` gives `'failed'`.
- `'fails an empty or oversized token without asking'`: `''` and 2,049 characters give `'failed'`; `fetchImpl` not called.
- `'answers Cloudflare's test secrets itself, without a network call'` (decision 22): with `secretKey: TEST_SECRET_PASSES`, token `'XXXX.DUMMY.TOKEN.XXXX'` gives `'passed'`; with `TEST_SECRET_FAILS` the same token gives `'failed'`; `fetchImpl` is not called in either. The empty and oversized token rule still applies first.
- `'fails closed when Cloudflare cannot be asked'`: fetch rejects, answers 500, answers non-JSON, or takes longer than `timeoutMs`: each gives `'unavailable'`. For the last case use a short real `timeoutMs` (50 ms) and a `fetchImpl` that never answers but rejects with `signal.reason` when its `signal` aborts. No fake timers: Vitest's fake timers do not drive `AbortSignal.timeout`, so that case would hang or pass for the wrong reason.
- `'never logs the token or the secret'`: spy `console.warn`; no logged argument contains either.

`app.test.ts`: `'the CSP lets the bot check load and frame itself, and nothing else new'`: `content-security-policy` on `GET /health` contains `script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com` and `frame-src 'self' https://challenges.cloudflare.com`; splitting the `script-src` directive on spaces gives no token equal to `'unsafe-eval'` or `'unsafe-inline'` (a substring check would trip on `'wasm-unsafe-eval'`).

- [x] **Step 2: Run them to see them fail**

Run: `npx vitest run apps/api/src/audit/turnstile.test.ts apps/api/src/app.test.ts`
Expected: FAIL.

- [x] **Step 3: Implement**

Read Cloudflare's server-side validation and testing pages first; record the siteverify fields, the test keys and the date in the module note, and add both pages to `docs/SOURCES.md` under "The photo audit". `siteverify` answers `TEST_SECRET_PASSES` with `'passed'` and `TEST_SECRET_FAILS` with `'failed'` without a request (after the token length check), the note saying why: dev and tests never reach Cloudflare, and production refuses these keys except on a local host (Task 8). Otherwise it posts form-encoded `secret`, `response`, `remoteip` (when known) with `AbortSignal.timeout(timeoutMs)`; `'passed'` only when `success === true`, `hostnames.includes(hostname)` and `action === TURNSTILE_ACTION`; on a failure it logs the `error-codes`, `hostname` and `action` it saw. The note above `TURNSTILE_ACTION` says the web app declares the same value in `apps/web/src/audit/turnstile.ts` on purpose: `label-core` is not the place for it and the web app does not import the API, so a web test (Task 9) pins the client's copy to `'audit'`. In `app.ts`, add `https://challenges.cloudflare.com` to `script-src` and `'frame-src': ["'self'", 'https://challenges.cloudflare.com']`, and extend the comment above the helmet block: the second widening, argued for the same way.

- [x] **Step 4: Run the tests, mutation test, checks, CHANGELOG**

Run: `npx vitest run apps/api` (PASS). Remove the hostname comparison: the other-host test fails; restore. Remove the local answer for test secrets: "answers Cloudflare's test secrets itself" fails (`fetchImpl` is called); restore. Run `npm run lint && npm run typecheck`. Run `npm run test:e2e`: the existing pages still load under the widened policy. CHANGELOG `### Added`: siteverify with hostname and action, failing closed; the CSP admits Turnstile.

- [x] **Step 5: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add apps/api/src docs/SOURCES.md CHANGELOG.md
git commit -m "feat(api): verify Turnstile tokens by host and action, and let the widget load"
```

---

### Task 7: Per-visitor daily reads in Mongo

**Files:**
- Create: `apps/api/src/audit/visitorAllowance.ts`, `apps/api/src/audit/visitorAllowance.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces:
  - `export const visitorKey = (key: string, ip: string | undefined): string` (decision 10: HMAC-SHA256 keyed by `key`, which is `AUDIT_IP_HASH_KEY` from Task 8, over `ipKeyGenerator(ip ?? 'unknown')` from `express-rate-limit`, first 32 hex characters; `createHmac` from `node:crypto`)
  - `export interface VisitorAllowance { take(visitor: string, limit: number): Promise<boolean>; left(visitor: string, limit: number): Promise<number> }`
  - `export function databaseVisitorAllowance(now?: () => Date): VisitorAllowance` (model `AuditVisitorDay`, collection `audit_visitor_days`: `_id: '<YYYY-MM-DD>:<visitor>'`, `reads: number`, `expiresAt: Date` with a TTL index at `expireAfterSeconds: 0`; `expiresAt` is 00:00 UTC two days after the counted day)
  - `export function memoryVisitorAllowance(now?: () => Date): VisitorAllowance`

- [x] **Step 1: Write the failing tests** (run each behavior against both implementations with `describe.each`; the database one inside `withDatabase()`)

- `'takes reads until the limit, then refuses'`: limit 5; five `take` true, the sixth false; `left` goes 5, 4, ... 0.
- `'counts each visitor apart'`.
- `'starts a new UTC day at zero'`: clock moves from `2026-11-19T23:59Z` to `2026-11-20T00:01Z`.
- `'refuses everything at a limit of zero'`.
- `'two first reads at once are both counted'` (database only): `Promise.all` of two `take` on an empty day; both true, `reads` is 2.
- `'stores no address, and no unkeyed hash of one'` (database only): after a `take` for `visitorKey(KEY, '203.0.113.7')`, the stored `_id` contains neither `'203.0.113.7'` nor the first 32 hex characters of its unkeyed sha256 (`createHash('sha256').update(ipKeyGenerator('203.0.113.7')).digest('hex').slice(0, 32)`).
- `'gives the same address a different visitor under another key'`: with two 32-character keys `KEY_A` and `KEY_B`, `visitorKey(KEY_A, '203.0.113.7') !== visitorKey(KEY_B, '203.0.113.7')`, and each is 32 hex characters.
- `'groups an IPv6 visitor by its /56'`: `2001:db8:0:100::1` and `2001:db8:0:1ff::1` share a /56 but not a /64, and give the same `visitorKey(KEY, ...)`; `2001:db8:0:100::1` and `2001:db8:0:200::1` sit in different /56s and differ; `visitorKey(KEY, '203.0.113.7') !== visitorKey(KEY, '203.0.113.8')`. (Addresses that share a /64 would pass for /64 grouping too, and prove nothing about /56.)
- `'forgets a visitor within two days'`: the stored `expiresAt` for a read on 2026-11-19 is `2026-11-21T00:00:00.000Z`.

- [x] **Step 2: Run to fail, implement, run to pass**

Run: `npx vitest run apps/api/src/audit/visitorAllowance.test.ts` (FAIL, then PASS). Port the upsert-with-guard and duplicate-key retry from `dailyAllowance.ts:64-86` (its notes explain why the first read of a day is tried twice), keyed by `_id: day:visitor` with `$setOnInsert: { expiresAt }`. `left` reads the document and returns `max(0, limit - reads)`.

- [x] **Step 3: Mutation test, checks, CHANGELOG**

Remove the duplicate-key retry: the "two first reads" test fails (run it a few times if it is timing dependent); restore. Replace the HMAC with an unkeyed `createHash('sha256')`: "gives the same address a different visitor under another key" and "stores no address, and no unkeyed hash of one" fail; restore. Run `npm run lint && npm run typecheck`. CHANGELOG `### Added`: per-visitor daily reads, under a keyed hash of the network, kept two days.

- [x] **Step 4: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add apps/api/src/audit/visitorAllowance.ts apps/api/src/audit/visitorAllowance.test.ts CHANGELOG.md
git commit -m "feat(api): count each visitor's live reads per UTC day"
```

---

### Task 8: Public mode on the server

**Files:**
- Create: `apps/api/src/audit/refusals.ts`
- Modify: `apps/api/src/env.ts`, `env.test.ts`, `apps/api/src/audit/routes.ts`, `routes.test.ts`, `apps/api/src/app.ts`, `app.test.ts`, `apps/api/src/server.ts`, `apps/api/.env.example`, `docker-compose.yml`, `CHANGELOG.md`
- Delete: `apps/api/src/audit/dailyAllowance.ts`, `apps/api/src/audit/dailyAllowance.test.ts`

**Interfaces:**
- Consumes: `VerifyTurnstile`, `TURNSTILE_HEADER`, `siteverify`, `TEST_SITE_KEY`, `TEST_SECRET_PASSES`, `TEST_SECRET_FAILS` (Task 6); `VisitorAllowance`, `visitorKey`, `memoryVisitorAllowance`, `databaseVisitorAllowance` (Task 7); `AuditSpend`, `SpendRefused` (Task 5).
- Produces, `refusals.ts`:
  - `export type AuditUnavailableReason = 'budget' | 'ip' | 'unconfigured'`
  - `export type AuditRefusal = AuditUnavailableReason | 'unavailable' | 'bot-check'`
  - `export const REFUSALS: Readonly<Record<AuditRefusal, { status: number; error: string }>>`: budget 429 `'Live photo reads are paused for now. Try the sample label.'`; ip 429 `'This network has used its live photo reads for now. Try the sample label.'`; unconfigured 503 `'This server does not read photographs live. Try the sample label.'`; unavailable 503 `'Live photo reading is not available right now. Try the sample label.'`; bot-check 403 `'The bot check did not pass. Complete it again, or try the sample label.'`
  - `export function refuse(response: Response, reason: AuditRefusal): void` (writes `{ error, reason }`)
  - The module note says which copy a visitor sees: the client's `REFUSAL_COPY` (Task 9), never these strings; the server's `error` strings exist for API callers and the logs. It also says the reason unions are declared again in `apps/web/src/api/audit.ts` on purpose (`label-core` is not the place for them, and the web app does not import the API), and that a web test pins the client's list (Task 9). The duplication is accepted, not an oversight.
- Produces, `routes.ts`: `AuditLimits = { perHour: number; perVisitorPerDay: number; statusPerMinute: number }`; `DEFAULT_AUDIT_LIMITS = { perHour: 20, perVisitorPerDay: 5, statusPerMinute: 60 }`; `export interface AuditVisitors { allowance: VisitorAllowance; ipHashKey: string }`; `AuditRouterOptions = { extract?; apiKey?; turnstile?: { siteKey: string; verify: VerifyTurnstile }; limits?: AuditLimits | false; visitors?: AuditVisitors; spend?: AuditSpend }`; `AUDIT_BODY_LIMIT = '6mb'`; `MAX_PHOTO_BASE64 = 5 * 1024 * 1024`.
- Produces, `GET /api/audit/status`: `{ available: boolean; reason: AuditUnavailableReason | null; siteKey: string | null }` with `Cache-Control: no-store`, behind its own per-IP limiter (`statusPerMinute`, 60 a minute; past it, 429 `{ error: 'Too many status checks. Try again in a minute.' }`).
- Produces, `app.ts`: `AppOptions.auditTurnstile?`, `AppOptions.auditVisitors?: AuditVisitors` (replaces `auditAllowance`).
- Produces, `env.ts`: `AUDIT_PUBLIC: boolean` (`'true' | 'false'`, default false, like `MCP_ENABLED`), `TURNSTILE_SITE_KEY?`, `TURNSTILE_SECRET_KEY?`, `TURNSTILE_HOSTNAMES: string[]` (`hostnameList`), `AUDIT_IP_HASH_KEY?: string` (trimmed, at least 32 characters; decision 23), `AUDIT_READS_PER_IP_PER_DAY: number` (digits, default 5, max 1,000); `AUDIT_DAILY_LIMIT` removed.

- [x] **Step 1: Write the failing env tests** (`env.test.ts`)

Cross-field rules, each asserting the message names the variable:
- production + `ANTHROPIC_API_KEY` + budget, with neither `AUDIT_API_KEY` nor `AUDIT_PUBLIC`: throws `/AUDIT_API_KEY/` and the message mentions `AUDIT_PUBLIC`.
- `AUDIT_PUBLIC: 'true'` with `AUDIT_API_KEY` set: throws `/AUDIT_PUBLIC/` (any environment).
- `AUDIT_PUBLIC: 'true'` without the site key, the secret, or the hostnames: throws naming each missing one (any environment).
- `AUDIT_PUBLIC: 'true'` without `AUDIT_IP_HASH_KEY`: throws `/AUDIT_IP_HASH_KEY/` (any environment, development included); a 31-character key throws; a 32-character key parses.
- production + `AUDIT_PUBLIC: 'true'` + complete Turnstile config, without `TRUST_PROXY_HOPS`, with `'0'` or with `'2'`: throws `/TRUST_PROXY_HOPS/`; with `'1'` it parses.
- `'production refuses Cloudflare's test keys'` (decision 22): production + `AUDIT_PUBLIC: 'true'` + an otherwise complete config with `TURNSTILE_HOSTNAMES: 'packwright.example'`: `TURNSTILE_SITE_KEY: TEST_SITE_KEY` throws `/TURNSTILE_SITE_KEY/`; `TURNSTILE_SECRET_KEY: TEST_SECRET_PASSES` throws `/TURNSTILE_SECRET_KEY/`, and so does `TEST_SECRET_FAILS`.
- `'the test keys start production on a local host only'`: the same production config with the test site key and `TEST_SECRET_PASSES` parses with `TURNSTILE_HOSTNAMES: 'localhost'` and with `'localhost,127.0.0.1'`, and throws with `'localhost,packwright.example'`. Outside production (`NODE_ENV: 'development'`) the test keys parse with any hostnames.
- `'a complete public production config starts without AUDIT_API_KEY'` (with non-test keys and a 32-character `AUDIT_IP_HASH_KEY`).
- `AUDIT_PUBLIC: 'yes'` throws; `AUDIT_READS_PER_IP_PER_DAY` defaults to 5; `TURNSTILE_HOSTNAMES: 'https://packwright.example'` throws.

- [x] **Step 2: Write the failing route tests** (`routes.test.ts`, public app: `turnstile: { siteKey: '1x00000000000000000000AA', verify }` with `verify` a `vi.fn`, `visitors: { allowance: memoryVisitorAllowance(), ipHashKey: 'k'.repeat(32) }`, memory ledger with a $10 budget)

Key and public modes are now exclusive, so Task 5's `describe('what a read may spend')` tests move to this public harness, with `verify` resolving `'passed'` and an `X-Turnstile-Token` header on each POST. Delete or rewrite against the per-visitor count the existing tests this task invalidates: the status table at `routes.test.ts:485-494` (the `keyRequired` shape), and the deployment-wide day-count tests at `:272`, `:324`, `:349`, `:365`, `:460` and `:468` (the `AuditDay` count is retired, decision 2).

- `'checks the bot before it reads a byte of the body'`: `verify` resolves `'failed'`; a 3 MB body is refused 403 `reason: 'bot-check'`, and an `express.json` spy (or the existing "reads before it refuses" harness at `routes.test.ts:395`) shows the body was not parsed.
- `'sends the token and the visitor address to siteverify'`: header `X-Turnstile-Token: tok`; `verify` called with `{ token: 'tok', remoteIp: <request.ip> }`.
- `'a missing token is a failed check'`: no header gives 403 `bot-check` without calling `verify`.
- `'a check Cloudflare could not answer refuses as unavailable'`: `'unavailable'` gives 503 `reason: 'unavailable'`.
- `'counts a read against the visitor only once it is a valid photo'`: a bad body (400) does not change `left`; a good read does.
- `'refuses a visitor past their reads with the per-network copy'`: limit 1; the second read is 429 `reason: 'ip'`.
- `'a forged leftmost X-Forwarded-For does not change the rate-limit key'`: `trustProxyHops: 1`, `perHour: 2`, no extract; three POSTs with `X-Forwarded-For: 198.51.100.<n>, 203.0.113.7` for n = 1, 2, 3: the third is 429 `reason: 'ip'`; a fourth with `198.51.100.9, 203.0.113.8` is not 429. That app has no extractor, so it stops at `unconfigured` and never reaches the daily count.
- `'a forged leftmost X-Forwarded-For does not change the daily count'`: its own app, `trustProxyHops: 1`, the default `perHour`, `perVisitorPerDay: 1`, a fake extractor that resolves the reading, and `verify` resolving `'passed'`; two valid reads with `X-Forwarded-For: 198.51.100.1, 203.0.113.7` and `198.51.100.2, 203.0.113.7`: the second is 429 `reason: 'ip'`.
- Status: `'status hands the browser the site key'` (`siteKey: '1x00000000000000000000AA'`, `available: true`, `reason: null`); `'status says unconfigured without an extractor, or in key mode'`; `'status says budget when the day has no room'`; `'status says ip once this address has used its reads'` (Review Focus 5); `'a status that cannot read its counts says paused'` (visitors `left` rejects: `available: false, reason: 'budget'`); `'status is never cached'`; `'the 61st status check in a minute is refused'` (default limits: 60 `GET /api/audit/status` answer 200, the 61st answers 429 with `{ error: 'Too many status checks. Try again in a minute.' }`).
- Key mode keeps its 401 tests (`describe('the shared secret')`). `'key mode is not counted per visitor'` (decision 1): a key-mode app built with memory visitors anyway, `perVisitorPerDay: 1` and a fake extractor; two reads with the key both answer 200, neither is 429 `reason: 'ip'`, and the visitor's `left` is still 1. Body limits: the 413 test uses the new figures, and `MAX_PHOTO_BASE64` stays below `AUDIT_BODY_LIMIT`.

- [x] **Step 3: Run them to see them fail**

Run: `npx vitest run apps/api/src/env.test.ts apps/api/src/audit/routes.test.ts`
Expected: FAIL.

- [x] **Step 4: Implement**

POST `/ghs` guard order, written out in the router as today ("Order is the whole of this"):
1. hourly per-IP limiter (`express-rate-limit`, `message: { error: REFUSALS.unavailable.error, reason: 'unavailable' }`: not `ip`, because the status checks only the daily count, so an `ip` answer here would be followed by a status that says a read is possible);
2. key mode: the existing key check; public mode: the Turnstile guard (`request.get(TURNSTILE_HEADER)`; missing or `'failed'` gives `refuse('bot-check')`, `'unavailable'` gives `refuse('unavailable')`);
3. `express.json({ limit: AUDIT_BODY_LIMIT })`;
4. no extractor: `refuse('unconfigured')`;
5. shape, size, photo signature (unchanged 400 and 413);
6. public mode only (decision 1; skipped in key mode even when `visitors` is given): `visitors.allowance.take(visitorKey(visitors.ipHashKey, request.ip), limits.perVisitorPerDay)`: false gives `refuse('ip')`, a throw gives `refuse('unavailable')`;
7. the metered call (`SpendRefused` gives `refuse('budget')`; a ledger store that throws while reserving surfaces from `metered` as `SpendUnavailable` (Task 5) and gives `refuse('unavailable')`, logged, never Express's generic 500). Route test: `'a ledger that cannot reserve answers unavailable, not a 500'`.

Status: `GET /status` sits behind its own per-IP limiter (`express-rate-limit`, `limits.statusPerMinute` a minute, `message: { error: 'Too many status checks. Try again in a minute.' }`). Then, in order: no extractor, or `apiKey` set, gives `unconfigured`; ledger room below the reservation gives `budget`; `visitors.allowance.left(visitorKey(visitors.ipHashKey, request.ip), ...) === 0` gives `ip`; any read that throws gives `budget` (logged); otherwise `available: true, reason: null`. `siteKey` is `turnstile?.siteKey ?? null` in every answer. The status module note says why the answer is `Cache-Control: no-store` although the shared conventions call it a cached flag: the `ip` reason is per visitor, so no cache between the visitor and the app may share it.

From the independent review of PR #121 (2026-11-21):
- No path may call a live extractor unmetered. Today `createAuditRouter` passes `extract` through unwrapped when `spend` is absent, and only `server.ts` building both together keeps production metered. Make the router throw `Error('An extractor needs a spend ledger.')` when `extract` is given without `spend`; route and app tests that are not about spending pass a ledger over `memoryLedgerStore()` with a budget large enough never to refuse. Test: `'an extractor without a spend ledger is refused when the router is built'`.
- The status's ledger read (`roomTodayMicros`) is cached in memory for 5 s, so a flood of status checks from many addresses reads Atlas at most once every 5 s for the budget. A read that throws is not cached, the per-visitor `ip` count is still read per request, and the HTTP answer stays `Cache-Control: no-store`. A stale answer costs nothing, because the read itself still reserves. Test: `'two status checks within five seconds read the ledger once'` (a fake clock; a third after 5 s reads it again).

Rewrite the two notes that state the old body limits with the new figures: the note above the 256 KB parser in `app.ts` (`:313`, "A fortieth of the audit route's ten megabytes") and the `MAX_PHOTO_BASE64` note in `routes.ts` ("8 MB clears both readings of the upstream limit ...": now 5 MiB under a 6 MB body limit, still well above a 2576 px JPEG at quality 0.92).

`env.ts`: the fields and the rules above (messages: `AUDIT_API_KEY` "is required in production when ANTHROPIC_API_KEY is set, unless AUDIT_PUBLIC is true"; `AUDIT_PUBLIC` "cannot be true while AUDIT_API_KEY is set: choose the public bot-checked path or the key"; each Turnstile field "is required when AUDIT_PUBLIC is true"; `AUDIT_IP_HASH_KEY` "is required when AUDIT_PUBLIC is true, at least 32 characters: it keys the hash each visitor's count is stored under (generate one with openssl rand -hex 32)"; `TRUST_PROXY_HOPS` "must be exactly 1 in production when AUDIT_PUBLIC is true: one load balancer stands in front of the app, so 0 counts the load balancer instead of the visitor, and more than 1 lets a visitor forge an X-Forwarded-For entry"; `TURNSTILE_SITE_KEY` or `TURNSTILE_SECRET_KEY` "is one of Cloudflare's test keys, which production accepts only when every TURNSTILE_HOSTNAMES entry is localhost or 127.0.0.1"). The test keys come from `audit/turnstile.ts` (Task 6), which imports nothing heavy. Rewrite the `AUDIT_API_KEY` note: the owner's path, metered by the ledger and the hourly limiter but not counted per visitor, and since 2026-11-18 no longer the public path (spec section 10).

`server.ts`: `auditLimits: { perHour: DEFAULT_AUDIT_LIMITS.perHour, perVisitorPerDay: env.AUDIT_READS_PER_IP_PER_DAY, statusPerMinute: DEFAULT_AUDIT_LIMITS.statusPerMinute }`, and only when `env.AUDIT_PUBLIC`: `auditTurnstile: { siteKey: env.TURNSTILE_SITE_KEY!, verify: siteverify({ secretKey: env.TURNSTILE_SECRET_KEY!, hostnames: env.TURNSTILE_HOSTNAMES }) }` and `auditVisitors: { allowance: databaseVisitorAllowance(), ipHashKey: env.AUDIT_IP_HASH_KEY! }` (key mode gets no `auditVisitors`, decision 1); log `live photo reads are public, behind Turnstile` or `live photo reads need AUDIT_API_KEY`. Delete `dailyAllowance.ts` and its test, and the `auditAllowance` option.

`.env.example`: `AUDIT_PUBLIC`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (with the test keys, and a note that they are Cloudflare's public test values, which production refuses unless every `TURNSTILE_HOSTNAMES` entry is `localhost` or `127.0.0.1`), `TURNSTILE_HOSTNAMES`, `AUDIT_IP_HASH_KEY` (blank, with "required when AUDIT_PUBLIC is true; at least 32 characters; generate with openssl rand -hex 32"), `AUDIT_READS_PER_IP_PER_DAY`; remove `AUDIT_DAILY_LIMIT`. `docker-compose.yml` `app.environment` adds: `ANTHROPIC_API_KEY: sk-ant-local-dummy-never-called`, `AUDIT_PUBLIC: 'true'`, the test site key and always-pass secret, `TURNSTILE_HOSTNAMES: localhost` (the only reason production starts with the test keys, decision 22), `AUDIT_IP_HASH_KEY: local-only-not-a-secret-0123456789abcdef` (40 characters, with a comment that it is a fixed local dummy, used only here, and that production's value lives in SSM), `AI_MONTHLY_BUDGET_USD: '0'` (fixed, not a variable: the dummy key must never be called), `TRUST_PROXY_HOPS: '1'`, with a comment saying a real key here would be a paid run that needs James's OK.

- [x] **Step 5: Run the tests**

Run: `npx vitest run apps/api`
Expected: PASS.

- [x] **Step 6: Mutation test**

Move `express.json` above the Turnstile guard: the "before it reads a byte" test fails. Key the daily count on `request.get('x-forwarded-for')` instead of `request.ip`: "does not change the daily count" fails. Drop the `TRUST_PROXY_HOPS` rule: its env test fails; relax it to "1 or more": the `'2'` case fails. Drop the test-key refusal: "production refuses Cloudflare's test keys" fails. Drop the localhost exception (refuse the test keys in every production): "the test keys start production on a local host only" fails. Drop the `AUDIT_IP_HASH_KEY` rule: its env test fails. Remove the public-mode condition on step 6: "key mode is not counted per visitor" fails. Remove the status limiter: "the 61st status check in a minute is refused" fails. Restore all eight.

- [x] **Step 7: All checks and CHANGELOG**

Run all checks, then `docker compose --profile prod config` (it validates the compose file this task changed; expected: exit 0, the `app` environment printed with the values above), then `npm run verify:image`, because the start-up rules the image runs under changed. Expected: PASS. CHANGELOG `### Changed`: live photo reads are public behind Turnstile, a per-visitor daily allowance under a keyed hash (`AUDIT_IP_HASH_KEY`) and the budget (James, 2026-11-18, reversing the 2026-10-18 shared key); production refuses Cloudflare's test keys except on a local host; `AUDIT_DAILY_LIMIT` removed; the body limit cut to 6 MB.

- [x] **Step 8: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add -A apps/api docker-compose.yml CHANGELOG.md
git commit -m "feat(api): public photo reads behind Turnstile, a per-visitor allowance and the budget"
```

---

### Task 9: The audit page in public mode

**Files:**
- Create: `apps/web/src/audit/turnstile.ts`, `apps/web/src/audit/turnstile.test.ts`, `apps/web/src/audit/refusalCopy.ts`, `e2e/the-bot-check.spec.ts`
- Modify: `apps/web/src/api/audit.ts`, `apps/web/src/api/audit.test.ts`, `apps/web/src/views/AuditView.vue`, `apps/web/src/views/AuditView.test.ts`, `e2e/the-label-audit.spec.ts`, `CHANGELOG.md`

**Interfaces:**
- Consumes: the status shape and refusal bodies from Task 8.
- Produces, `api/audit.ts`:
  - `export type AuditUnavailableReason = 'budget' | 'ip' | 'unconfigured'`; `export type AuditRefusalReason = AuditUnavailableReason | 'unavailable' | 'bot-check'`
  - `export interface AuditStatus { available: boolean; reason: AuditUnavailableReason | null; siteKey: string | null }`
  - `export const TURNSTILE_HEADER = 'X-Turnstile-Token'`
  - `AuditError` gains `readonly reason: AuditRefusalReason | null`
  - `readGhsLabel(photo: LabelPhoto, regime: GhsRegime, turnstileToken: string | null): Promise<LabelReading>`
  - `AUDIT_KEY_HEADER` removed.
- Produces, `audit/turnstile.ts`:
  - `export const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'`, `export const TURNSTILE_ACTION = 'audit'` (must equal the server's; its note says the duplication is on purpose, since `label-core` is not the place for it and the web app does not import the API, and that a test pins it)
  - `export interface TurnstileWidget { token: Readonly<Ref<string | null>>; failed: Readonly<Ref<boolean>>; reset(): void }`
  - `export function useTurnstile(container: Readonly<ShallowRef<HTMLElement | null>>, siteKey: Readonly<Ref<string | null>>): TurnstileWidget`
- Produces, `audit/refusalCopy.ts`: `export const REFUSAL_COPY: Readonly<Record<AuditRefusalReason, string>>`:
  - budget: "Live photo reads are paused for now. The sample label shows the whole audit, with a reading Claude made earlier."
  - ip: "You've used the live photo reads this network gets for now. The sample label shows the whole audit, with a reading Claude made earlier."
  - unconfigured: "This server doesn't read photographs live. The sample label shows the whole audit, with a reading Claude made earlier."
  - unavailable: "Live photo reading isn't available right now. The sample label shows the whole audit, with a reading Claude made earlier."
  - bot-check: "The bot check didn't go through. Complete it again to read your photo, or try the sample label."
  - The module note says this is the copy a visitor sees; the server's `REFUSALS` strings (Task 8) exist for API callers and the logs, and the page never shows them.

- [x] **Step 1: Write the failing client tests** (`api/audit.test.ts`)

Replace `describe('the audit key and the server status')` with `describe('the server status and the bot check')`: `auditStatus()` returns the new shape; returns `null` for `{ available: true, keyRequired: false }`, for a `reason` outside the three, for a non-string `siteKey`, and for any non-200 answer (a 429 from the status limiter, a 500); `readGhsLabel(photo, 'eu-clp', 'tok')` sends `X-Turnstile-Token: tok`; with `null` it sends no such header; it never sends `X-Audit-Key`; a 429 `{ error, reason: 'ip' }` becomes an `AuditError` with `reason: 'ip'`; an unknown `reason` becomes `null`. `'speaks the server's action and refusal reasons, which are copied on purpose'`: `TURNSTILE_ACTION` (from `../audit/turnstile`) is `'audit'`, and `Object.keys(REFUSAL_COPY).sort()` equals `['bot-check', 'budget', 'ip', 'unavailable', 'unconfigured']`, the server's `AuditRefusal` list (decision recorded in both notes: the duplication is accepted, and this test is its check).

- [x] **Step 2: Write the failing widget tests** (`audit/turnstile.test.ts`)

Install a fake `window.turnstile = { render, reset, remove }` before each test (the loader resolves at once when it exists, so no script is added). `'renders once both the box and the site key are there'` (render called with `{ sitekey, action: 'audit', callback, 'expired-callback', 'error-callback' }`); `'holds the token the widget hands back'`; `'forgets a token that expired, and marks a failed check'`; `'reset forgets the token and asks the widget for a new one'`; `'removes the widget with its scope'`; `'adds the script once, however many widgets there are'` (no `window.turnstile`: `document.head` gains exactly one `script[src="<TURNSTILE_SCRIPT_URL>"]`).

- [x] **Step 3: Write the failing page tests** (`AuditView.test.ts`)

Mock the widget: build `widget = { token: ref<string | null>(null), failed: ref(false), reset: vi.fn(() => { widget.token.value = null }) }` inside `vi.hoisted` (importing `ref` from `vue` there, since `vi.mock` is hoisted above ordinary imports), then `vi.mock('../audit/turnstile', () => ({ useTurnstile: () => widget }))`; reset its token, `failed` and the spy in `beforeEach`. Delete `describe('the audit key')`. New tests:
- `'asks for no bot check where the server needs none'` (status with `siteKey: null`): no `[data-test="bot-check"]`; Read enabled once a market and a photo are chosen.
- `'waits for the bot check before it will read'` (`siteKey` set): Read disabled until `widget.token.value = 'tok'`.
- `'resets the bot check after every attempt, so no token is sent twice'` (Review Focus 3): the read's fetch carried `X-Turnstile-Token: tok`; `widget.reset` called once after a success and once after a refusal; Read disabled afterwards.
- `it.each(['budget', 'ip', 'unconfigured'])('hides the bot check and the read button when no read is possible, and offers the sample (%s)')` (Review Focus 5 for `ip`): `[data-test="audit-unavailable"]` text equals `REFUSAL_COPY[reason]`; no `[data-test="bot-check"]`, no `[data-test="read"]`; clicking `[data-test="unavailable-sample"]` shows `[data-test="sample-notice"]`.
- `'a status that could not be fetched offers the sample, not a read'` (decision 12): while the status request is still pending, Read is disabled; when it then answers 500 (so `auditStatus()` gives `null`), `[data-test="audit-unavailable"]` text equals `REFUSAL_COPY.unavailable`, there is no `[data-test="read"]` and no `[data-test="bot-check"]`, and `[data-test="unavailable-sample"]` loads the sample.
- `'a refused read says so plainly and points at the sample'`: POST answers 429 `reason: 'ip'`: `[data-test="read-refused"]` contains `REFUSAL_COPY.ip` and a sample button; no `[role="alert"]`; `/api/audit/status` was fetched again.
- `'will not read while the sample's own reading is on screen'`: after loading the sample, Read is disabled; after choosing a photo of one's own it is enabled again.
- `'forgets an audit key an earlier version kept'`: `localStorage.setItem('packwright.auditKey', 'x')` before mount; `null` after.
- `'says where a photo goes'`: `[data-test="photo-privacy"]` mentions Anthropic, Cloudflare, MongoDB Atlas, AWS and 14 days.

- [x] **Step 4: Run them to see them fail**

Run: `npx vitest run apps/web/src/api/audit.test.ts apps/web/src/audit/turnstile.test.ts apps/web/src/views/AuditView.test.ts`
Expected: FAIL.

- [x] **Step 5: Implement**

`useTurnstile`: a module-level promise that appends the script once and resolves on `load`; `watchEffect` renders when both refs are set and `window.turnstile` is ready; callbacks set `token` and `failed`; `reset()` calls `window.turnstile.reset(id)` and clears `token`; `onScopeDispose` calls `remove(id)`. Declare `window.turnstile` in a small `declare global` block in the same file.

`AuditView.vue`: remove `AUDIT_KEY_STORAGE`, `auditKey`, `keyEverRefused`, `keyRefused`, `askForKey`, `storedAuditKey` and the key section (`:93-133`, `:535-569`) and the 401 branch; in setup, `try { localStorage.removeItem('packwright.auditKey') } catch {}`. Add `const botCheck = shallowRef<HTMLElement | null>(null)`, `const widget = useTurnstile(botCheck, siteKey)` where `siteKey = computed(() => status.value?.available === true ? status.value.siteKey : null)`. A `statusLoaded` ref turns true once `auditStatus()` has settled, whatever it answered. `unavailableReason = computed(() => !statusLoaded.value ? null : status.value === null ? 'unavailable' : status.value.available === false ? (status.value.reason ?? 'unconfigured') : null)` (a status that could not be fetched shows the `unavailable` block and the sample, not a Read button). `canRead` = `statusLoaded`, photo, market, not busy, `unavailableReason === null`, `!sampleOnScreen`, and (`siteKey === null` or a token). `read()` sends `widget.token.value`, and its `finally` calls `widget.reset()` when a site key is in use; a refusal with a `reason` sets `refusal` (shown as `[data-test="read-refused"]`, `role="status"`, with a "Try the sample label" button) instead of the red alert, and re-fetches the status for `budget`, `ip` and `unconfigured`. Replace "This server is not set up to read photographs" with the `[data-test="audit-unavailable"]` block (copy from `REFUSAL_COPY`, plus `[data-test="unavailable-sample"]`), rendered where the bot check and the Read button would be. The bot-check box is a `div` with `ref="botCheck"`, `data-test="bot-check"`, and a visible label "Bot check". Under the Read button, `[data-test="photo-privacy"]`: "Reading a photo sends it to Anthropic, whose Claude model reads it; Packwright doesn't keep the photo. The bot check is run by Cloudflare. To share live reads fairly, Packwright counts them per network for two days, and keeps that count and its reading budget in MongoDB Atlas. It runs on AWS, and its server logs, which include IP addresses, are kept for 14 days." Rewrite the sample button's comment: it needs no key and sends nothing.

`api/audit.ts`: the new types, header and parsing (`auditStatus()` returns `null` for any non-200); the module note loses the key paragraph and says the reason unions copy the server's `refusals.ts` on purpose (the web app does not import the API), checked by the test in Step 1.

- [x] **Step 6: Update and add the browser tests**

`e2e/the-label-audit.spec.ts`: the status route answers `{ available: true, reason: null, siteKey: null }` and the comment says a server that needs no bot check. Delete the case at `:174` that stubs `keyRequired: true` for the key UI this task removes (or rewrite it as a status with `available: false, reason: 'unconfigured'` showing the unavailable block and the sample). Create `e2e/the-bot-check.spec.ts`, `'the bot check loads under the CSP and its token goes with the read'`: an init script records `securitypolicyviolation` events; `page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', ...)` fulfills a fake script that defines `window.turnstile` whose `render` appends an `iframe` with `src` `https://challenges.cloudflare.com/fake-frame` and calls `callback('XXXX.DUMMY.TOKEN.XXXX')` on a timeout; that frame URL is fulfilled with a tiny HTML page; status answers `{ available: true, reason: null, siteKey: '1x00000000000000000000AA' }`; `**/api/audit/ghs` records the `x-turnstile-token` header and fulfills the recorded reading. Assert: the iframe is attached, Read becomes enabled, the recorded header is `XXXX.DUMMY.TOKEN.XXXX`, Read is disabled again after the read, and no CSP violation was recorded. Nothing reaches Cloudflare: every `challenges.cloudflare.com` request is fulfilled by a route.

- [x] **Step 7: Run everything**

Run all checks. Expected: PASS.

- [x] **Step 8: Mutation test**

Drop `widget.reset()` from `finally`: the "no token is sent twice" test fails. Drop `!sampleOnScreen` from `canRead`: its test fails. Make a `null` status read as available (drop the `status.value === null` branch of `unavailableReason`): "a status that could not be fetched offers the sample, not a read" fails. Remove `https://challenges.cloudflare.com` from `frame-src` in `app.ts`: `the-bot-check.spec.ts` fails. Restore all four.

- [x] **Step 9: CHANGELOG and commit**

CHANGELOG `### Changed`: the audit page drops the key, shows Turnstile only when a read is possible, explains every refusal and offers the sample, and says where a photo goes. Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add -A apps/web e2e CHANGELOG.md
git commit -m "feat(web): public photo reads with a bot check, and the sample on every refusal"
```

---

### Task 10: The free path on the first screen

**Files:**
- Create: `apps/web/src/views/LandingView.test.ts`
- Modify: `apps/web/src/views/LandingView.vue`, `apps/web/src/views/AuditView.vue`, `apps/web/src/views/AuditView.test.ts`, `CHANGELOG.md`

**Interfaces:**
- Consumes: `loadSample()` in `AuditView.vue`.
- Produces: `/audit?sample=1` loads the sample on arrival.

- [x] **Step 1: Write the failing tests**

`LandingView.test.ts` (mount with `testRouter('/')`): `'offers the editor, a live audit and the sample in its header'`: inside `header`, links with text "Open the editor" to `/labels/new`, "Audit a label photo" to `/audit`, and "Try the sample label" to `/audit?sample=1`. `AuditView.test.ts`: `'arrives with the sample on screen when asked'`: mounting at `/audit?sample=1` shows `[data-test="sample-notice"]` with no click, and fetched `/samples/acetone-label.png` exactly once.

- [x] **Step 2: Run to fail, implement, run to pass**

Run: `npx vitest run apps/web/src/views/LandingView.test.ts apps/web/src/views/AuditView.test.ts` (FAIL). In the landing `header`, add a row of three `RouterLink`s styled with `BUTTON`: duplicate the editor link (today in a `section` below, reading "Open the editor →") into the header row as the first of the three, and keep the lower one. In `AuditView.vue`, `onMounted(() => { if (route.query.sample === '1') void loadSample() })` using `useRoute()`. Run again: PASS.

- [x] **Step 3: Checks, CHANGELOG, commit**

Run all checks (PASS). CHANGELOG `### Added`: the landing page links straight to a live audit and to the sample. Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add apps/web CHANGELOG.md
git commit -m "feat(web): link the audit and the sample from the landing page"
```

- [x] **Step 4: PR checkpoint (stage boundary: public mode)**

As in Task 5 Step 9: `git diff --shortstat dev...HEAD`, `/security-review`, draft "Public photo reads behind a bot check, with the sample as the free path" (Tasks 6 to 10, and the reversal of the 2026-10-18 shared-key decision); suggest `/code-review high <PR#>`. Stop for James's OK to push; stop again for his OK to open the PR.

---

### Task 11: Saved labels: 7 days, a 1,000 cap, 64 KB each

**Files:**
- Modify: `apps/api/src/labels/labelDocument.ts`, `labelDocument.test.ts`, `apps/api/src/labels/labelDocumentRoutes.ts`, `labelDocumentRoutes.test.ts`, `apps/web/src/views/LabelsView.vue`, `LabelsView.test.ts`, `apps/web/src/views/EditorView.vue`, `apps/web/src/views/EditorSaveView.test.ts`, `apps/web/src/api/savedLabels.ts`, `savedLabels.test.ts`, `e2e/the-label-cap.spec.ts`, `CHANGELOG.md`

**Interfaces:**
- Produces: `LABEL_LIFETIME_SECONDS = 7 * 24 * 60 * 60` (604,800); `LABEL_CAP = 1_000`; `MAX_IDS_PER_LIST = 200`; `LABEL_MAX_BYTES = 64 * 1024`.

- [x] **Step 1: Write the failing tests**

- `labelDocument.test.ts`: the TTL index has `expireAfterSeconds: 604800`.
- `labelDocumentRoutes.test.ts`: `expect(LABEL_CAP).toBe(1000)`; the cap tests store 1,000 (one `insertMany`); the 409 body is exactly `'There are already 1,000 saved labels, which is as many as this app keeps. Labels are removed 7 days after their last change, so try again later, or delete one of yours from Saved labels.'`; the list's `cap` is 1000; `'a list asks about at most 200 ids'` (201 ids gives 400 and the detail says "up to 200"); `'refuses a label past 64 KB, on create and on replace'` (a valid `us-food` document of exactly 65,537 bytes: 413 with `error` `'This label is too large to save: a saved label can be at most 64 KB. Shorten its longest fields, or export it as a PDF instead.'`, nothing stored; one of exactly 65,536 bytes, built the same way, is accepted). One ingredient name cannot get there (`INPUT_BOUNDS` allows 16,000 characters, and Zod counts UTF-16 units), so pad across several ingredients (the list allows 1,000 entries) with a small helper in the test file, `labelOfBytes(bytes)`: start from a valid `us-food` document; add ingredients whose names are ASCII `'x'` runs of up to 16,000 characters (one byte each); measure `Buffer.byteLength(JSON.stringify(validated), 'utf8')`, where `validated` is the document parsed by the schema the route validates with (it may strip or default fields, and the route measures what it parsed); lengthen the last name by the difference until the measure is exactly `bytes`, and assert that it is before returning the raw document.
- `LabelsView.test.ts`: the ownership paragraph says "7 days" and names MongoDB Atlas and AWS; the count line at the cap reads "This app keeps 1,000 labels and has 1,000, ...".
- `EditorSaveView.test.ts:299, :309`: the 409 text above, and "1,000 of 1,000 saved, as many as this app keeps. ...".
- `e2e/the-label-cap.spec.ts`: `FULL` and the faked `cap` and `count` move to 1,000 and 7 days.

- [x] **Step 2: Run them to see them fail**

Run: `npx vitest run apps/api/src/labels apps/web/src/views`
Expected: FAIL.

- [x] **Step 3: Implement**

`labelDocument.ts`: the lifetime and its note (seven days since 2026-11-18, spec 5.4; the `collMod` note stays and now matters: a database that already has the 30-day index keeps it, so the production database starts empty and is checked with `getIndexes()` at go-live). `labelDocumentRoutes.ts`: `LABEL_CAP` with a rewritten note (1,000 x 64 KB is about 64 MB of the shared 512 MB M0); `MAX_IDS_PER_LIST` used by `readIds` (`:136`) with its own note (a URL of 1,000 ids is about 25 KB, past Node's 16 KB header limit); `AT_CAP` formats with `toLocaleString('en-US')`; POST and PUT check `Buffer.byteLength(JSON.stringify(parsed.data), 'utf8') > LABEL_MAX_BYTES` after validation and before any write. `savedLabels.ts:126`: `MOST_IDS` stays 200 with its comment rewritten (it matches `MAX_IDS_PER_LIST`, no longer the cap), and `listLabels` (`:157`) stops slicing to the newest 200: it asks in chunks of `MOST_IDS`, one request each, and joins the answers, so a browser that holds more than 200 labels (possible once the cap is 1,000) still lists, opens and deletes every one. `savedLabels.test.ts`: `'lists every held label, 200 ids to a request'` (250 held ids: two requests of 200 and 50, 250 labels listed). `LabelsView.vue:150`: "Labels are removed 7 days after their last change. They're stored in MongoDB Atlas, and Packwright runs on AWS."; the count line and `EditorView.vue:281` format numbers with `toLocaleString('en-US')`.

- [x] **Step 4: Run all checks, mutation test**

Run all checks (PASS). Remove the byte check from PUT only: the replace case fails; restore. Put back `.slice(0, MOST_IDS)` in `listLabels`: the 250-id test fails; restore.

- [x] **Step 5: CHANGELOG and commit**

CHANGELOG `### Changed`: labels expire after 7 days, the cap is 1,000, a label is at most 64 KB. Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add apps e2e CHANGELOG.md
git commit -m "feat: keep saved labels 7 days, up to 1,000 of them, 64 KB each"
```

---

### Task 12: The production server's lifecycle

**Files:**
- Create: `apps/api/src/httpServer.ts`, `apps/api/src/httpServer.test.ts`
- Modify: `apps/api/src/env.ts`, `env.test.ts`, `apps/api/src/db.ts`, `db.test.ts`, `apps/api/src/static.ts`, `static.test.ts`, `apps/api/src/app.ts`, `app.test.ts`, `apps/api/src/server.ts`, `scripts/serve-with-memory-mongo.mjs`, `Dockerfile`, `scripts/verify-image.sh`, `docker-compose.yml`, `apps/api/.env.example`, `CHANGELOG.md`

**Interfaces:**
- Produces:
  - `GET /health/live` answers 200 `{ status: 'ok' }` without asking the database. `/health` is unchanged (readiness, 503 when Mongo is down).
  - `httpServer.ts`: `export const KEEP_ALIVE_TIMEOUT_MS = 130_000`, `export const HEADERS_TIMEOUT_MS = 131_000`, `export const SHUTDOWN_GRACE_MS = 25_000`; `export function configureTimeouts(server: Server): void`; `export function shutDownGracefully(server: Server, closeDatabase: () => Promise<void>, graceMs?: number): Promise<void>`
  - `db.ts`: `export const MONGO_MAX_POOL_SIZE = 10`; `connectToDatabase(uri)` passes `{ maxPoolSize: MONGO_MAX_POOL_SIZE }`.
  - `static.ts`: `export function requireWebRoot(nodeEnv: Env['NODE_ENV'], webRoot: string | undefined): string | undefined` (throws in production when `webRoot` is undefined).
  - `env.ts`: `MONGODB_URI` must name a database.

- [x] **Step 1: Write the failing tests**

- `env.test.ts`: `it.each(['mongodb://localhost:27017', 'mongodb://localhost:27017/', 'mongodb://localhost:27017/?replicaSet=rs0', 'mongodb+srv://u:p@cluster.example.net/?retryWrites=true'])('refuses %s, which names no database', ...)` throwing `/MONGODB_URI/` with "database"; `mongodb+srv://u:p@cluster.example.net/packwright?retryWrites=true` parses.
- `app.test.ts`: `'liveness answers without the database'`: `databaseStatus: () => 'disconnected'`: `/health/live` 200 while `/health` is 503; `'liveness is never the client'` (with a `webRoot`, `/health/live` is JSON).
- `db.test.ts`: `'keeps a small connection pool'`: connect to a `MongoMemoryServer` URI with a database name through `connectToDatabase`; `mongoose.connection.getClient().options.maxPoolSize` is 10.
- `static.test.ts`: `requireWebRoot('production', undefined)` throws naming the client build; `requireWebRoot('development', undefined)` is `undefined`; production with a root returns it.
- `httpServer.test.ts` (a real `http.createServer` on port 0): `'outlasts the load balancer's idle timeout'` (`keepAliveTimeout` 130000, `headersTimeout` greater); `'finishes the request in flight, then closes the database once'`; `'does not wait for an idle keep-alive connection'` (a keep-alive agent holds a socket; shutdown resolves within 1 s); `'gives up on a request that never ends after the grace period'` (`graceMs` 100; resolves within 1 s and `closeDatabase` still runs).

- [x] **Step 2: Run them to see them fail**

Run: `npx vitest run apps/api/src/env.test.ts apps/api/src/app.test.ts apps/api/src/db.test.ts apps/api/src/static.test.ts apps/api/src/httpServer.test.ts`
Expected: FAIL.

- [x] **Step 3: Implement**

`env.ts`: regex `^mongodb(\+srv)?:\/\/[^/\s]+\/[^/?\s]+` with the message "MONGODB_URI must name its database, such as mongodb://localhost:27017/packwright (an Atlas URI without one writes to `test`)". `scripts/serve-with-memory-mongo.mjs:141`: `mongo.getUri('packwright')`. `shutDownGracefully`: `server.close()` (promise), `server.closeIdleConnections()`, a `setTimeout(graceMs)` (unref'd) that calls `server.closeAllConnections()`, then `await closeDatabase()`. The `httpServer.ts` module note says why `SHUTDOWN_GRACE_MS` (25 s) can sit under the 60 s read timeout: in ECS the target is deregistered (a delay of about 90 s, spec Phase 2) before SIGTERM arrives, so reads in flight normally finish first; a read still running at the 25 s cut-off is dropped and keeps its reservation (over-counted, never under-counted). Neither figure changes. `server.ts`: `const webRoot = requireWebRoot(env.NODE_ENV, resolveWebRoot())`; `const server = app.listen(...)`; `configureTimeouts(server)`; `process.once` for `SIGTERM` and `SIGINT` runs `shutDownGracefully(server, disconnectFromDatabase)` then `process.exit(0)` (1 on error), logging "stopping: finishing requests in flight". In `app.ts`, update the `/health` note: readiness for smoke tests; the load balancer and the container check use `/health/live`. `Dockerfile`: `HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]` (the same command goes in the ECS task definition in Phase 3). `verify-image.sh`: wait on `/health/live`; then `/health` is 200; then, timed, `docker stop -t 30 <app>` must exit 0 (not 137) in under 30 s. `docker-compose.yml`: the same `healthcheck`. `.env.example`: the `MONGODB_URI` note.

- [x] **Step 4: Run all checks and the image check**

Run all checks, then `npm run verify:image`. Expected: PASS.

- [x] **Step 5: Mutation test**

Remove `configureTimeouts(server)`'s `headersTimeout` line: its test fails. Remove `closeAllConnections`: the never-ending request test times out. Remove the database-name regex: its env cases fail. Restore all three.

- [ ] **Step 6: CHANGELOG and commit**

CHANGELOG `### Added` and `### Changed`: `/health/live`; keep-alive 130 s; graceful stop; a pool of 10; the database name required; production refuses to start without its client build. Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add apps/api scripts Dockerfile docker-compose.yml CHANGELOG.md
git commit -m "feat(api): liveness, keep-alive past the load balancer, and a graceful stop"
```

---

### Task 13: MCP settings and Anthropic's second range

**Files:**
- Modify: `apps/api/src/mcp/routes.ts`, `apps/api/src/mcp/routes.test.ts`, `apps/api/src/mcp/server.ts`, `apps/api/src/mcp/server.test.ts`, `apps/api/src/env.ts`, `env.test.ts`, `apps/api/src/server.ts`, `apps/api/.env.example`, `CHANGELOG.md`

**Interfaces:**
- Produces: `DEFAULT_MCP_LIMITS = { anthropicPerHour: 1_000, perClientPerHour: 60 }`; env `MCP_ANTHROPIC_CALLS_PER_HOUR?: number` (digits, 1 to 100,000); `isFromAnthropic` recognizes `160.79.104.0/21` and `153.61.208.0/20`; `WHAT_IS_NOT_CHECKED_URL = 'https://github.com/musicteachj/packwright/blob/main/docs/WHAT-IS-NOT-CHECKED.md'`.

- [ ] **Step 1: Write the failing tests**

`routes.test.ts`, extend the range table at `:227`: `['153.61.207.255', false]`, `['153.61.208.0', true]`, `['153.61.223.255', true]`, `['153.61.224.0', false]`, `['::ffff:153.61.208.1', true]`; the shared bucket test also shares one bucket across both ranges. `expect(DEFAULT_MCP_LIMITS.anthropicPerHour).toBe(1000)`. `env.test.ts`: `MCP_ANTHROPIC_CALLS_PER_HOUR` parses `'1000'`, refuses `'0'` and `'many'`. `server.test.ts`: the URL points at `main`.

- [ ] **Step 2: Run to fail, implement, run to pass**

Run: `npx vitest run apps/api/src/mcp apps/api/src/env.test.ts` (FAIL). Re-read Anthropic's IP addresses page and record both outbound ranges and the date in the note above `ANTHROPIC_OUTBOUND`; add the subnet; rewrite the `anthropicPerHour` note (the spec's trade-off: about 0.2 vCPU at worst, and the shared claude.ai allowance can be used up five times faster). `server.ts`: `limits: { ...DEFAULT_MCP_LIMITS, anthropicPerHour: env.MCP_ANTHROPIC_CALLS_PER_HOUR ?? DEFAULT_MCP_LIMITS.anthropicPerHour }`. Run again: PASS.

- [ ] **Step 3: Mutation test, checks, CHANGELOG, commit**

Remove the new subnet: the `153.61.208.0` case fails; restore. Run all checks (PASS). CHANGELOG `### Changed`. Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add apps/api CHANGELOG.md
git commit -m "feat(mcp): recognize both Anthropic ranges and make their allowance a setting"
```

---

### Task 14: Small fixes: the sample's date, link previews, `/design` hidden in production

**Files:**
- Create: `apps/web/src/designCatalog.ts`, `apps/web/src/linkPreview.test.ts`, `apps/web/src/components/SiteHeader.test.ts`
- Modify: `apps/web/src/audit/sample.ts`, `apps/web/src/views/AuditView.test.ts` (`:769`), `apps/web/index.html`, `apps/web/src/router/pages.ts`, `pages.test.ts`, `apps/web/src/router/index.ts`, `apps/web/src/components/SiteHeader.vue`, `apps/web/vite.config.ts` (and an `ImportMetaEnv` declaration for `VITE_DESIGN_CATALOG` only if `vue-tsc` asks for one; `vite/client` already types `import.meta.env`), `playwright.config.ts`, `scripts/verify-build.sh`, `CHANGELOG.md`

**Interfaces:**
- Produces: `export const DESIGN_CATALOG: boolean = import.meta.env.DEV || import.meta.env.VITE_DESIGN_CATALOG === 'true'`; `pages.ts`: `export const DESIGN_PATH = '/design'`, `export function pagePaths(designCatalog: boolean): readonly string[]`; `createAppRouter(history: RouterHistory, options?: { designCatalog?: boolean }): Router`.

- [ ] **Step 1: Write the failing tests**

- `AuditView.test.ts:769`: the notice contains `2026-11-18`.
- `linkPreview.test.ts` (reads `apps/web/index.html` from disk): `og:title`, `og:description`, `og:url` `https://packwright.jameslittlefield.net/`, `og:image` `https://packwright.jameslittlefield.net/og-image.png` with width 1200 and height 630, `og:image:alt`, and `twitter:card` `summary_large_image` are present; every `og:` URL is absolute https.
- `pages.test.ts`: `pagePaths(true)` equals `PAGE_PATHS`; `pagePaths(false)` lacks `/design` and keeps the rest; `createAppRouter(createMemoryHistory(), { designCatalog: false }).resolve('/design').name` is `'not-found'`, and `'design'` with `true`.
- `SiteHeader.test.ts`: with `vi.mock('../designCatalog', () => ({ DESIGN_CATALOG: false }))` there is no `a[href="/design"]`; the other three links remain.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run apps/web/src`
Expected: FAIL.

- [ ] **Step 3: Implement**

`sample.ts`: `recordedOn: '2026-11-18'`, comment "(`569fdce`)". `index.html`: the tags above (`og:type` `website`, `og:site_name` `Packwright`, the description reused), and drop "Link-preview tags wait for Phase 8" from the comment. The router builds its child routes with a function that leaves out `design` when the flag is false; `SiteHeader.vue` filters `LINKS` by `DESIGN_CATALOG`; `vite.config.ts` becomes `defineConfig(({ mode }) => ...)`, renames its plugin to `writePagePaths()`, and writes `pagePaths(loadEnv(mode, <the config's env directory>, 'VITE_').VITE_DESIGN_CATALOG === 'true')`: Vite's `loadEnv` reads the same `.env` files and prefixed process variables that fill the client's `import.meta.env`, so the client and `routes.json` read one source (a bare `process.env` would miss a `VITE_DESIGN_CATALOG=true` in `apps/web/.env`, and the server would 404 a page the client routes). `playwright.config.ts`: prefix the build with `VITE_DESIGN_CATALOG=true` and say why in the comment (the catalog's own specs). `verify-build.sh`: `/design` on the built server answers 404 with the client.

- [ ] **Step 4: Run all checks**

Run all checks. Expected: PASS (the design-catalog, masthead and shell browser specs still pass on the flagged build).

- [ ] **Step 5: Mutation test, CHANGELOG, commit**

Make `pagePaths` ignore its argument: `verify:build` fails at the `/design` check; restore. CHANGELOG `### Fixed`/`### Added`. Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add apps/web playwright.config.ts scripts/verify-build.sh CHANGELOG.md
git commit -m "fix(web): date the sample, add link previews, and keep /design out of production"
```

- [ ] **Step 6: PR checkpoint (stage boundary: hardening)**

As in Task 5 Step 9, for Tasks 11 to 14 ("Saved labels, server lifecycle, MCP and small fixes for the demo"). Two stops: push, then PR.

---

### Task 15: CI hardening

**Files:**
- Create: `.github/workflows/security.yml`
- Modify: `.github/workflows/ci.yml`, `CHANGELOG.md`

**Interfaces:** none (CI only).

- [ ] **Step 1: Harden `ci.yml`**

Add top-level `permissions: contents: read`. Pin, with the version as a trailing comment (Open Door's pins, `open-door/.github/workflows/security.yml:27`, `:78`, `ci.yml:348`): `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1` with `persist-credentials: false`; `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0` (keep `node-version-file` and `cache: 'npm'`); `actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2`. If the network is available, confirm each with `gh api repos/actions/<name>/commits/<sha> --jq .sha`.

- [ ] **Step 2: Write `security.yml`**

Modeled on `open-door/.github/workflows/security.yml`: on push to `main` and `dev`, pull requests, `schedule: - cron: '0 13 * * 1'` (Mondays, weekly), and `workflow_dispatch`; the same `concurrency` block; `permissions: contents: read`. Job `secrets` (gitleaks 8.30.1, downloaded and checked against its published checksum, `fetch-depth: 0`, `./gitleaks git --redact --verbose --exit-code 1`), copied as is. Job `dependencies`: checkout and setup-node (pinned as above), then `npm audit --audit-level=high` (it reads `package-lock.json`; no install).

- [ ] **Step 3: No `dependabot.yml`**

James decided on 2026-11-19: no routine version-update PRs. Dependabot security updates come from the GitHub repository setting (master plan Phase 0), plus this workflow's weekly `npm audit`. Nothing to write in this step; it stays so the step numbers below don't shift.

- [ ] **Step 4: Verify locally**

Run: `npm run format:check` (PASS; Prettier parses the YAML). Run: `grep -nE '^\s*-?\s*uses:' .github/workflows/*.yml | grep -vE '@[0-9a-f]{40} # v'` (expected: no output). Run: `npm audit --audit-level=high` (expected: exit 0; if it fails, stop and show James the advisories: no exceptions are added silently). If `gitleaks` is installed (`gitleaks version`), run `gitleaks git --redact --verbose --exit-code 1` over the full history (expected: no leaks; otherwise CI runs it on the first push).

- [ ] **Step 5: CHANGELOG and commit**

CHANGELOG `### Added`: gitleaks over the whole history, a weekly dependency audit, read-only workflow permissions and SHA-pinned actions. Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add .github CHANGELOG.md
git commit -m "ci: scan for leaked secrets, audit dependencies weekly, pin every action"
```

---

### Task 16: Docs

**Files:**
- Modify: `docs/DESIGN.md`, `docs/security-review-2026-10-18.md`, `docs/BACKLOG.md`, `README.md`, `docs/USE-FROM-YOUR-AI.md`, `docs/plans/2026-10-08-road-to-deployment.md`, `CHANGELOG.md`

**Interfaces:** none.

- [ ] **Step 1: `docs/DESIGN.md` § Phase 8 (`:718-813`)**

- *Build* (`:723-725`): the Dockerfile is three-stage (`npm ci` and the root `npm run build`; a `deps` stage that installs the API workspace's run-time dependencies alone, `npm ci --omit=dev --omit=optional --workspace=@packwright/api`; ship that `node_modules` and `apps/api/dist`); `label-core` has no build step (tsup bundles it); AWS resources move to `portfolio-infra` (CDK, ECS on one EC2 instance, SSM Parameter Store, not Secrets Manager), and this plan is the Phase 1 record.
- *Done when* (`:727-733`): liveness `/health/live` for the target group; readiness `/health` for smoke tests; secrets from SSM; the bundle grep includes the Turnstile site key.
- Replace "The audit key and the daily audit limit" (`:771-775`) with "Public photo reads (James, 2026-11-18)": reverses the 2026-10-18 shared key; Turnstile before the body, a per-visitor allowance of 5 a day, the paced ledger (`AI_MONTHLY_BUDGET_USD` 10, multiplier 3, floor $0.50), `AI_MONTHLY_BUDGET_USD=0` as the off switch, `TRUST_PROXY_HOPS=1` required, `AUDIT_IP_HASH_KEY` (at least 32 characters) keying the per-visitor hash; draining the budget is accepted as an availability outcome bounded in dollars, with the sample as the fallback.
- "Rate limits and quotas are per process" (`:752-759`): the per-visitor count and the ledger are in Mongo; only the hourly limiters are per process.
- "Edge-level limits" (`:760-770`): the WAF is now the shared three-rule web ACL in `portfolio-infra` (spec 5.5).
- "Saved labels" (`:776-783`): `expireAfterSeconds: 604800` (7 days), cap 1,000, 64 KB; the production database starts empty; check `getIndexes()` at go-live.
- `/mcp` (`:784-797`): `MCP_ANTHROPIC_CALLS_PER_HOUR` (1,000), both ranges; `WHAT_IS_NOT_CHECKED_URL` now names `main`, and resolves once the Phase 3 release fast-forwards `main` to `dev` (`docs/WHAT-IS-NOT-CHECKED.md` is not on `main` yet).
- "The live address in the docs" and "Link-preview tags" (`:798-804`): mark done, with the date.

- [ ] **Step 2: `docs/security-review-2026-10-18.md`**

Append "## Addendum, 2026-11-19: public photo reads": James's decision of 2026-11-18 (spec section 10) reverses the shared key of fix 2; what now bounds the spend (Turnstile, per-visitor reads, the ledger, Anthropic's $12 workspace limit); the stale "$0.13 a call" (`:39-41`) is Opus 5 pricing, and a read now costs about $0.02 to $0.04, $0.112 at worst; closed: "a vision call retried by the SDK is billed twice" (`:124`, `maxRetries` 0) and "a vision call keeps running after the client disconnects" (`:126-127`, the abort signal, which `liveExtractor` hands to the SDK in production, and a 60 s timeout below the 120 s idle timeout). Leave the original findings as written.

- [ ] **Step 3: `docs/BACKLOG.md` (frozen: mark entries settled, add none)**

In the existing "**Settled <date> ...**" style: the key's `localStorage` and the key lines (`:1220-1226`) settled by the key's removal from the page; "Edge-level limits are phase 8's" (`:946`) settled by the shared WAF in `portfolio-infra`; "The audit route's quotas are per process" (`:982`) narrowed: the per-visitor count and the ledger are in Mongo.

- [ ] **Step 4: README, USE-FROM-YOUR-AI, the old road**

`README.md` § Status (`:85-86`): the public demo is at `https://packwright.jameslittlefield.net` once Phase 3 deploys it; § Running it: "Run the production image locally" (`docker compose --profile prod up -d --build`, port 8080, live reads off, and `npm run verify:image`). `docs/USE-FROM-YOUR-AI.md:3-4`: replace the "Not live yet" notice with the connector address and one line saying it serves once the deployment is live. `docs/plans/2026-10-08-road-to-deployment.md`: a note under the title: "Its deployment parts are superseded by `docs/plans/2026-11-19-portfolio-demo-readiness.md` (2026-11-19) and the portfolio-infra design."

- [ ] **Step 5: Checks, CHANGELOG, commit**

Run: `EM=$(printf '\342\200\224'); git diff dev -- docs README.md | grep '^+' | grep -n "$EM"` (expected: no output, so no new line carries an em dash). CHANGELOG `### Changed` (docs). Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add docs README.md CHANGELOG.md
git commit -m "docs: record public photo reads, the budget, and the new deployment path"
```

---

### Task 17: Em dashes out of visitor-visible copy (last code task)

**Files:**
- Create: `apps/web/src/noEmDashes.test.ts`
- Modify: `apps/web/src/**/*.vue` templates, visitor-visible string literals in `apps/web/src/**/*.ts` and in `.vue` script blocks (for example `REGIME_NAMES` in `AuditView.vue`'s script, the announcer's messages, page titles), `apps/web/index.html`, server error strings that reach the page (`apps/api/src/**`: `error:` and limiter `message:` values), and every unit and browser test that asserts one of them; `CHANGELOG.md`

**Interfaces:** none. Out of scope (decision 20): `packages/label-core`, MCP tool output, code comments.

- [ ] **Step 1: Write the failing guard test**

`noEmDashes.test.ts`: for every `.vue` file under `apps/web/src`, take the `<template>` block, strip HTML comments, and expect no em dash (write it in the test as the JavaScript escape for U+2014 (backslash, u, 2014), never as the literal character); the failure lists `file:line`. Also assert `apps/web/index.html` outside comments has none.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run apps/web/src/noEmDashes.test.ts`
Expected: FAIL with about 40 template lines listed (42 on 2026-11-19). The guard covers templates only; about 39 more lines in `.vue` script blocks are found by Step 3's grep.

- [ ] **Step 3: Replace them**

Rewrite each with a colon, a comma, parentheses or two sentences, reading each in place (no blind substitution). Keep en dashes in ranges (U+2013, as in the landing page's magnification range). Find the script-side strings with `EM=$(printf '\342\200\224')`, then `grep -rn "$EM" apps/web/src --include='*.ts' --include='*.vue'` (for `.vue` files, the lines outside `<template>`: string literals in the script blocks, such as `REGIME_NAMES`) and `grep -rnE "(error|message): .*$EM" apps/api/src`, skipping comments. Update the tests that assert the old strings.

- [ ] **Step 4: Run all checks**

Run all checks. Expected: PASS.

- [ ] **Step 5: CHANGELOG and commit**

CHANGELOG `### Changed`: visitor-facing text no longer uses em dashes. Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add apps e2e CHANGELOG.md
git commit -m "style: take em dashes out of visitor-facing text"
```

- [ ] **Step 6: PR checkpoint (stage boundary: CI, docs and copy)**

As in Task 5 Step 9, for Tasks 15 to 17. Two stops: push, then PR.

---

### Task 18: Local verification on the production image

Runs on the finished branch (or on `dev` once every PR is merged). Nothing here is committed in this repo.

**Files:**
- Modify: `/Users/jameslittlefield/Documents/github_things/portfolio-infra/PLAN.md` (Packwright's Phase 1 row only)

- [ ] **Step 1: Every automated check**

Run all checks and `npm run verify:image` (amd64). Expected: PASS.

- [ ] **Step 2: Start the production-like stack**

Run: `docker compose --profile prod up -d --build` and wait until `docker compose ps` shows `app` healthy.
Settings in force (from `docker-compose.yml`): `NODE_ENV=production`, `AUDIT_PUBLIC=true`, the test site key and always-pass secret (accepted in production only because `TURNSTILE_HOSTNAMES=localhost`, decision 22), `TURNSTILE_HOSTNAMES=localhost`, the local dummy `AUDIT_IP_HASH_KEY`, local Mongo (`packwright_prodlike`), dummy Anthropic key, `AI_MONTHLY_BUDGET_USD=0`, `TRUST_PROXY_HOPS=1`, read-only root, all capabilities dropped, 768 MiB.

- [ ] **Step 3: Liveness and readiness**

`curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/health/live` gives 200; `/health` gives 200 with `"database":"connected"`. `docker stop $(docker compose ps -q mongo)` (not `docker compose stop mongo`, which can stop the dependent `app` service with it): `/health/live` stays 200 throughout, and `/health` turns 503 within about 30 s (the driver notices on its next heartbeat, every 10 s by default; poll once a second rather than reading once). `docker start $(docker compose ps -aq mongo)`: `/health` returns to 200.

- [ ] **Step 4: Landing, editor, pages**

`/`, `/labels/new`, `/audit`, `/rules` each answer 200 with `<div id="app">`; `/design` answers 404 with the client. In a browser at `http://127.0.0.1:8080/`: the header offers "Open the editor", "Audit a label photo" and "Try the sample label"; the editor draws a label and exports a PDF.

- [ ] **Step 5: The sample works with no key, and budget 0 shows the free path**

`curl -s http://127.0.0.1:8080/api/audit/status | jq -e '.available == false and .reason == "budget" and .siteKey == "1x00000000000000000000AA"'` prints `true` and exits 0 (field by field, so the order the handler writes its keys in does not matter). In the browser, `/audit` shows the budget copy and a "Try the sample label" button, and no bot check and no Read button. "Try the sample label" (and `/audit?sample=1` directly) shows the sample photo, the recorded reading dated 2026-11-18, and the sample notice; accepting fields and typing capacity and size gives findings. `docker compose logs app` shows no call to Anthropic. `curl -s -X POST http://127.0.0.1:8080/api/audit/ghs -H 'Content-Type: application/json' -d '{}'` gives 403 with `"reason":"bot-check"`.

- [ ] **Step 6: A forged X-Forwarded-For does not change the rate-limit key**

Post a label export three times with the same rightmost entry and different leftmost ones, reading the `RateLimit` header (`draft-7`: `limit=60, remaining=<n>`):
```bash
for left in 198.51.100.1 198.51.100.2 198.51.100.3; do
  curl -s -o /dev/null -D - -X POST http://127.0.0.1:8080/api/labels/upc-a/export \
    -H 'Content-Type: application/json' -H "X-Forwarded-For: $left, 203.0.113.7" \
    -d '{"gtin":"036000291452"}' | grep -i '^ratelimit:'
done
```
Expected: `remaining` falls by one each time (one key for all three). The same request with `X-Forwarded-For: 198.51.100.9, 203.0.113.8` shows a fresh `remaining=59`.

- [ ] **Step 7: Headers**

`curl -sI http://127.0.0.1:8080/` shows `content-security-policy` with `script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com` and `frame-src 'self' https://challenges.cloudflare.com`, plus `x-content-type-options: nosniff`, `x-frame-options`, and `strict-transport-security`, which helmet's defaults in `app.ts` already send.

- [ ] **Step 8: No .env in the image, and nothing secret in the bundle**

Run: `docker run --rm --entrypoint sh packwright:local -c 'find / -name ".env*" -not -path "/proc/*" 2>/dev/null'`. Expected: no output. Run: `docker run --rm --entrypoint sh packwright:local -c 'grep -rlE "sk-ant-|1x00000000000000000000AA" /app/apps/api/dist/public || echo clean'`. Expected: `clean`. Run: `docker run --rm --entrypoint id packwright:local -u`. Expected: not `0`.

- [ ] **Step 9: The expiry index**

Run: `docker compose exec mongo mongosh packwright_prodlike --quiet --eval 'db.labeldocuments.getIndexes()'`. Expected: the `updatedAt_1` index with `expireAfterSeconds: 604800` (save one label first if the collection does not exist yet).

- [ ] **Step 10: Memory and a graceful stop**

Load `/`, the editor, `/audit?sample=1`, and export three PDFs; then `docker stats --no-stream` shows the `app` container under 768 MiB (record the figure for the Phase 2 task definition). `time docker compose stop app` takes under 30 s, and `docker inspect -f '{{.State.ExitCode}}' $(docker compose ps -aq app)` is 0.

- [ ] **Step 11: Not walked here: the real widget**

The real Turnstile widget only renders when a read is possible, which needs a budget above 0, and the compose file fixes it at 0 so the dummy key is never called. That the widget's script and frame load under the CSP is proven by `e2e/the-bot-check.spec.ts`; the live widget is a Phase 3 go-live check with real keys. Record this in the PLAN.md row.

- [ ] **Step 12: Tear down and record**

`docker compose --profile prod down` (keep the volume). Update Packwright's Phase 1 row in `portfolio-infra/PLAN.md`: Status "Done: local checks passed (Task 18), memory <figure> MiB", Updated with today's date, and the branch or PR links. Stop: show the change and wait for James's explicit OK before committing it in the `portfolio-infra` repo.

---

## Deferred to Phase 2/3 (AWS)

- CDK stacks, the EC2 instance, ECS cluster and Packwright's service and task definition (memory 256/768 MiB, `stopTimeout` 30 s, the `/health/live` container check, read-only root and dropped capabilities as verified in Task 18).
- ECR repository, scan-on-push, and image retention.
- The deploy workflow on pushes to `main`, its `production` environment, and `id-token: write` on that job only.
- GitHub OIDC deploy role and the per-app task and execution roles.
- Real Turnstile keys and the Turnstile site for the four hostnames, entered in SSM.
- A real `AUDIT_IP_HASH_KEY` (at least 32 characters, for example `openssl rand -hex 32`), entered in SSM; never the compose file's local dummy.
- Production values: `TRUST_PROXY_HOPS=1` behind the ALB, `TURNSTILE_HOSTNAMES=packwright.jameslittlefield.net`, `MCP_ALLOWED_HOSTS`, `AI_MONTHLY_BUDGET_USD=10`, the Atlas `MONGODB_URI` with its database name.
- The Anthropic Packwright workspace, its $12 limit and alerts, and its key in SSM.
- Atlas user, database, and network access for the Elastic IP; starting the production database empty and checking `getIndexes()` shows 604800.
- Route 53 records and the failover pair.
- The fallback site's Packwright page.
- AWS WAF rules (including Packwright's expensive paths: `/api/audit/*`, PDF exports, `/mcp`).
- Go-live checks on AWS: smoke tests, a second-network visitor and the real-IP check, budget 0 on the live host, the failover drill, `docker stats` on the instance, and the security checks of spec 5.10.
- GitHub repository settings (master plan Phase 0): secret scanning, Dependabot security updates, branch protection.
- Hand-testing the claude.ai connector against the live host, and `MCP_ALLOWED_ORIGINS` if it sends an `Origin`.
- Fast-forwarding `main` to `dev` (the Phase 3 release step, with James's OK).

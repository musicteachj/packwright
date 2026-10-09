# The phone scan-back test

> **Done by hand, by James.** No code. This is the gate `docs/DESIGN.md` calls "the one that actually
> matters" and that phase 2 listed as its real gate: a printed label scans with a phone and decodes to the
> expected GTIN. Every automated test measures the geometry the engine drew; none of them can say whether a
> printed symbol reads.

**What is being tested:** the default UPC-A label, exported by the app, printed at actual size, measured, and
scanned by the app's own scanner and by a stock phone app. Optionally, the print-test sheet as well. It
carries the same GTIN at three sizes and a control that should fail.

**Expected value everywhere:** `036000291452`. A reader that reports thirteen digits may show
`0036000291452`. That is the same GTIN in 13-digit form (GS1 defines a GTIN-12 inside thirteen digits as
carrying a leading zero), and it counts as a pass. The app's own scanner narrows it to the twelve digits
itself (`packages/label-core/src/gs1/scan.ts`).

---

## What was checked before writing this, on 2026-10-08

- **The command.** `scripts/serve-with-memory-mongo.mjs` imports the built `apps/api/dist/server.js` and
  starts a throwaway `mongod` for it. It needs `npm run build` first. It reads `PORT` and `NODE_ENV`, and sets
  `MONGODB_URI` itself. It was run as written below and answered on `:4173`, logging
  `packwright api listening on :4173 (production)`.
- **Plain HTTP to the laptop's LAN address does not work, and not only because of the camera.** This was
  measured with Chromium at `http://10.0.0.201:4173/labels/new`:
  - `window.isSecureContext` was `false`, so the camera is unavailable.
  - The page did not render at all. helmet sends `upgrade-insecure-requests` and HSTS, so the browser
    rewrote the page's own scripts and styles to `https://10.0.0.201:4173/…`, and those failed with
    `ERR_SSL_PROTOCOL_ERROR`.

  So the phone needs a real HTTPS origin. A tunnel gives one with no certificate to install on the phone,
  which is why it is the route below.
- **The export.** On a fresh `/labels/new`, the GTIN field reads `036000291452`. Export PDF downloads
  `036000291452.pdf`. That PDF was rendered at 2400 dpi and measured:
  - the page is 60.0 × 40.0 mm;
  - the bar pattern is **31.35 mm** wide from the first dark edge to the last, with 60 dark/light transitions
    (30 bars);
  - the guard bars are 24.5 mm tall.

  These figures were not taken from the engine and then expected back from it. The expectations come from the
  specification, and the PDF agrees with them (next item).
- **The figures, from the specification.** GS1 General Specifications, Release 26.0 (Ratified Jan 26),
  fetched from https://ref.gs1.org/standards/genspecs/ on 2026-10-08. The figures were read from the rendered
  pages, not from a text extract.
  - §5.2.3.5, table 5-12: "The symbol length in modules, including the minimum Quiet Zones, SHALL be"
    **113** for UPC-A. Table 5-11 gives the UPC-A quiet zones as 9X left and 9X right. So the bar pattern is
    113 − 18 = **95 modules**, and at the target X of 0.330 mm it is 95 × 0.330 = **31.35 mm**.
  - §5.12.3.1, table 5-44: the UPC-A X-dimension is **0.264 mm** minimum, **0.330 mm** target and
    **0.660 mm** maximum. Its footnote (\*) permits down to 0.249 mm "only … to on demand (e.g., thermal,
    laser) print processes".
  - §5.2.3.2: "the height of the symbol at the nominal size is 22.85 millimetres". The guard bars "SHALL be
    extended downward by 5x (e.g., 1.65 millimetres)". So a guard bar measures 22.85 + 1.65 = **24.50 mm**.
- **Not tried here:** the tunnel itself, since `cloudflared` is not installed on this machine, and anything
  on a phone. Step 2 checks the tunnel on the laptop before the phone is involved.

---

## You will need

- The laptop, on any network, and a phone with a camera.
- A printer, and plain white paper.
- A rule that can be read to 0.5 mm, preferably steel. Calipers are better if you have them.
- About thirty minutes.

---

## 1 · Serve the build

From the repository root, on `dev`:

```sh
npm run build
env -u ANTHROPIC_API_KEY PORT=4173 NODE_ENV=production node scripts/serve-with-memory-mongo.mjs
```

Wait for `packwright api listening on :4173 (production)`. Leave it running. The database lives and dies with
this process, so nothing saved during the test outlives it.

**Check the startup lines before going further.** Two lines below that one, after `serving the client from
…`, should be `no ANTHROPIC_API_KEY — /api/audit will answer 503`. Step 2 makes the app reachable from the
internet for as long as the tunnel runs. With a key loaded, anyone holding the URL could spend it.

The key can come from two places, and the command shuts out only one. `env -u` removes a key exported in
the shell; a blank `ANTHROPIC_API_KEY=` would not, because `apps/api/src/dotenv.ts` treats a blank as absent
and then loads `.env`. The other place is `.env` in the repository root. If the line still reads
`vision extraction configured`, that is where the key is: stop the server, move `.env` aside, and start
again.

## 2 · Give it an HTTPS address

In a second terminal:

```sh
brew install cloudflared          # once
cloudflared tunnel --url http://localhost:4173
```

This is Cloudflare's Quick Tunnel. It needs no account. It prints a `https://….trycloudflare.com` address,
which changes every time it starts. Cloudflare's own page states that it has no uptime guarantee and a
200-concurrent-request limit. Neither matters here.

**On the laptop first**, open `https://….trycloudflare.com/labels/new`. The editor should load with the
barcode drawn. If it does not, the tunnel is the problem, not the phone: record what the page shows and stop.

## 3 · Export the default label

On the laptop, stay on the tunnel address from step 2, `https://….trycloudflare.com/labels/new`.
`http://localhost:4173` would also be a secure context, and loads in Chromium. But the server's
`upgrade-insecure-requests` may be applied to localhost too by other browsers, Safari reportedly among them,
which would break the page the way it breaks over the LAN. The tunnel is an origin step 2 has already shown
to work.

- Check that the GTIN field reads `036000291452` and that Compliance says every check passed.
- Click **Export PDF**. The file is `036000291452.pdf`.

## 4 · Print at actual size, and measure

Open the PDF and print it on plain white paper.

- In the print dialog, choose **Actual size** or **100 %**. The names vary by app.
- Turn off anything named **Fit**, **Scale to fit** or **Shrink to printable area**. The page is 60 × 40 mm
  and the paper is larger, and some dialogs enlarge a small page to fill the sheet.

Then measure two things on the paper:

1. **The bar pattern's width.** Measure from the left edge of the first bar to the right edge of the last
   bar. Both are the long guard bars that reach below the others. Do not include the white space either side.
   - Expected: **31.35 mm**.
   - The printed X-dimension is that width ÷ 95.
2. **A guard bar's height.** Measure the long left-hand bar, top to bottom.
   - Expected: **24.50 mm**.
   - This catches a printer that scales one direction and not the other.

**The print is at actual size if the width is 31.35 ± 0.5 mm**, which means X between 0.325 and 0.335 mm,
and the height is 24.50 ± 0.5 mm. The ±0.5 mm is the reading error of a rule, not a GS1 tolerance.

If either figure is outside that range, the printer scaled the page. That is a failure of the print, not of
the barcode. Record the figures, fix the dialog, and print again before scanning. A scan of a scaled print
proves nothing about the label as designed.

## 5 · Scan with the app

On the phone, open `https://….trycloudflare.com/labels/new`.

1. Below 1024 px the editor shows one pane at a time, and it opens on **Preview**. Tap **Form**.
2. **Change the GTIN first**, so a successful read is visible. Replace it with `012345678905`. The field
   already reads `036000291452`, so a read of the same number would look like nothing happened.
3. Tap **Scan a barcode** and allow the camera.
4. Hold the printed label flat, in ordinary room light, 10–20 cm from the phone. Keep the bars roughly
   horizontal across the frame.

**A pass:** the camera closes by itself and the GTIN field reads `036000291452`. A read the form refuses
leaves the camera running, with a sentence under the field naming what was read and why it was refused.

That is the first of **three reads in all**, one per row of the record below. For the other two, reload the
page and repeat steps 2–4, so one lucky frame does not count as a pass. A reload puts the default GTIN back,
so change it again each time.

## 6 · Scan with a stock phone app

Use whatever the phone has that reads 1D barcodes. Candidates, not checked here:
- an iPhone's **Code Scanner** in Control Center, or the Camera app;
- **Google Lens** on Android.

Some stock apps search for the product instead of showing the number. **That counts only if the digits are
shown somewhere**: a product page with no number on it is not a decode. If the stock app does not read 1D
barcodes at all, record that, and that this step was not done.

## 7 · Optionally, the print-test sheet

```sh
npm run print-test --workspace @packwright/api
```

This writes `apps/api/print-test-sheet.pdf` (A4), a path `.gitignore` already covers.
Print it at actual size, as in step 4. It carries the same GTIN at three sizes. The expected bar-pattern
widths are 95 × X. Rendered from the PDF on 2026-10-08, the three blocks measured 25.06, 31.35 and 62.70 mm:

| block | X | bar pattern |
|---|---|---|
| 0.8x — minimum | 0.264 mm | 25.08 mm |
| 1.0x — nominal | 0.330 mm | 31.35 mm |
| 2.0x — maximum | 0.660 mm | 62.70 mm |
| CONTROL — quiet zone obstructed | 0.330 mm | should **not** scan; not worth measuring, since the black blocks run into the bars |

Scan each block with both readers, as in steps 5 and 6.

**The control is the point of the sheet.** If it scans too, the reader is being generous, and the passes
above it are worth less than they look. Record that plainly rather than counting it as a pass.

---

## What to record

One row per read. Paste it back into the conversation or into this file.

| # | symbol | reader | phone · OS · browser | read | attempts / seconds | notes |
|---|---|---|---|---|---|---|
| 1 | default label | app | | | | |
| 2 | default label | app | | | | |
| 3 | default label | app | | | | |
| 4 | default label | stock: … | | | | |

And once, for the print:

| printer | dialog setting | bar width (mm) | guard height (mm) | X = width ÷ 95 |
|---|---|---|---|---|
| | | | | |

For the app's reads, note the phone's browser. On an iPhone every browser is WebKit, so the app is reading
with its bundled zxing engine. Chrome on Android normally offers `BarcodeDetector`, and the app uses that
where it works. The engine is not shown on screen, so the browser is the record of which one was tested.

## What counts as a failure

- **A wrong number.** The reader returns anything other than `036000291452` (or `0036000291452`). This is
  the serious one. Stop, photograph the label and the result, and report it before anything else. A misread
  is worse than no read.
- **No read.** Any one of the three reads in step 5 that has not succeeded within about ten seconds, under
  the conditions given there. One miss in three is a failure, recorded with its row, not averaged away.
- **The app fails where the stock app reads,** or the other way round. Record it either way. A label that
  only the app can read is a problem, and so is an app scanner that cannot read a label a phone reads.
- **The control scans** (step 7). This is not a defect in the label, but the test is inconclusive and should
  say so.

Not failures of the label, but worth a line each:
- a print outside the ranges in step 4 (reprint);
- a tunnel or page that does not load (step 2);
- a camera that never asks for permission. Record the sentence the scanner shows, for example "Camera
  access was declined." or "This browser does not offer camera access to a web page."

## Afterwards

Stop `cloudflared` first, so the public address closes, then stop the server. The test labels go with its
database.

If everything passed, `docs/DESIGN.md`'s status row for phase 6 says scanning a real barcode by phone is
outstanding, and that line can be closed with the date and the phone used. If anything failed, the record
above goes into `docs/BACKLOG.md` with the photograph.

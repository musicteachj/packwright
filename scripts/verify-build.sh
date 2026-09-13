#!/usr/bin/env bash
# Exercises the *built* artifact: the PDF export, and the client it serves.
#
# The whole point is to run what ships rather than what the tests import. The
# suite once passed entirely while `npm start` answered its first export with a
# 500, because the fonts resolved from src/ and not from the bundle — tests could
# not see that, and only running the artifact could.
#
# It builds the repository root rather than the api workspace alone. Building
# only the API verifies a bundle whose client is whatever `apps/web/dist` happened
# to contain from some earlier run, or nothing at all, which is exactly the stale
# artifact this script exists to catch.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=${PORT:-5187}
BASE="http://localhost:${PORT}"
LOG=/tmp/pw-build-check.log

npm run build >/dev/null
PORT="$PORT" NODE_ENV=test node apps/api/dist/server.js >"$LOG" 2>&1 &
pid=$!
trap 'kill $pid 2>/dev/null || true' EXIT
for _ in $(seq 1 20); do curl -sf "${BASE}/health" >/dev/null && break; sleep 0.5; done

fail() { echo "$1"; tail -20 "$LOG"; exit 1; }

# --- the PDF export, against the bundle -------------------------------------
code=$(curl -s -o /tmp/pw-build-check.pdf -w '%{http_code}' -X POST \
  "${BASE}/api/labels/upc-a/export" \
  -H 'Content-Type: application/json' -d '{"gtin":"036000291452"}')
[ "$code" = "200" ] || fail "export failed: HTTP $code"
head -c 5 /tmp/pw-build-check.pdf | grep -q '%PDF-' || fail "not a PDF"
grep -q 'IBMPlexMono' /tmp/pw-build-check.pdf || fail "Plex not embedded in the built artifact"

# --- the single artifact: one server, serving the client ---------------------
# This is the assumption phase 8's deployment rests on. Confirming it locally
# costs nothing; discovering it on a first deploy costs a great deal.
curl -sf "${BASE}/" -o /tmp/pw-index.html || fail "the built server does not serve the client at /"
grep -q '<div id="app">' /tmp/pw-index.html || fail "/ served something that is not the client"

# A deep link is a real navigation under createWebHistory — the browser asks this
# server for /rules, not for /#/rules — so without a history fallback every route
# but / 404s on refresh.
# The body is checked, not just the status. A 200 alone would pass on any page at
# all, including an error page the server was happy about — and `/rules` is not a
# registered client route yet, so this exercises the generic fallback rather than
# a route, which is the weaker of the two things to be asserting.
for route in /labels/new /rules; do
  code=$(curl -s -o /tmp/pw-deep.html -w '%{http_code}' "${BASE}${route}")
  [ "$code" = "200" ] || fail "deep link ${route} returned HTTP ${code}, not the client"
  grep -q '<div id="app">' /tmp/pw-deep.html || fail "deep link ${route} served something else"
done

# The client's own hashed bundle, read out of the page it shipped in, so this
# follows a rename rather than pinning a hash that changes every build.
# `|| true` is load-bearing. Under `set -e` an assignment from a failing command
# substitution aborts the script, so without it a page with no bundle reference
# exited here silently — the guard on the next line was unreachable and CI showed
# a bare non-zero with no message and no log tail.
asset=$(grep -o '/assets/index-[^"]*\.js' /tmp/pw-index.html | head -1 || true)
[ -n "$asset" ] || fail "no hashed client bundle referenced in index.html"
code=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}${asset}")
[ "$code" = "200" ] || fail "the client's own bundle ${asset} returned HTTP ${code}"

# --- and what the fallback must never swallow --------------------------------
# An API caller that mistypes a route needs its JSON 404, not a page of HTML with
# a 200 on it; and a missing asset answered with index.html turns a broken
# reference into a page that half-loads and reports nothing.
for path in /api/labels/nope /assets/missing.js; do
  code=$(curl -s -o /tmp/pw-404.txt -w '%{http_code}' "${BASE}${path}")
  [ "$code" = "404" ] || fail "${path} returned HTTP ${code}, expected 404"
  grep -q '"error"' /tmp/pw-404.txt || fail "${path} 404'd as HTML rather than JSON"
done

echo "built artifact exports a Plex-embedded PDF ($(wc -c </tmp/pw-build-check.pdf) bytes)"
echo "built artifact serves the client, its deep links and its assets, and still 404s the API as JSON"

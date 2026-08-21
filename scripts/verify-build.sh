#!/usr/bin/env bash
# Builds the API and exercises the PDF export against the built artifact.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build --workspace @packwright/api >/dev/null
PORT=${PORT:-5187} NODE_ENV=test node apps/api/dist/server.js >/tmp/pw-build-check.log 2>&1 &
pid=$!
trap 'kill $pid 2>/dev/null || true' EXIT
for _ in $(seq 1 20); do curl -sf "http://localhost:${PORT:-5187}/health" >/dev/null && break; sleep 0.5; done
code=$(curl -s -o /tmp/pw-build-check.pdf -w '%{http_code}' -X POST \
  "http://localhost:${PORT:-5187}/api/labels/upc-a/export" \
  -H 'Content-Type: application/json' -d '{"gtinPayload":"03600029145"}')
[ "$code" = "200" ] || { echo "export failed: HTTP $code"; tail -20 /tmp/pw-build-check.log; exit 1; }
head -c 5 /tmp/pw-build-check.pdf | grep -q '%PDF-' || { echo "not a PDF"; exit 1; }
grep -q 'IBMPlexMono' /tmp/pw-build-check.pdf || { echo "Plex not embedded in the built artifact"; exit 1; }
echo "built artifact exports a Plex-embedded PDF (HTTP 200, $(wc -c </tmp/pw-build-check.pdf) bytes)"

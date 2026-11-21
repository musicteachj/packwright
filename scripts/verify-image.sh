#!/usr/bin/env bash
# Builds the production image and fails unless it is fit to ship.
#
#   npm run verify:image
#   PLATFORM=linux/arm64 npm run verify:image   # faster smoke check on Apple silicon
#   IMAGE=packwright:test npm run verify:image
#
# The checks are about what must NOT be in the image (any .env file, a key, a
# site key, the web app's packages or the build tools) and about whether it runs the way production will run it: as a
# non-root user, on a read-only filesystem, with every capability dropped.
set -euo pipefail

IMAGE="${IMAGE:-packwright:local}"
PLATFORM="${PLATFORM:-linux/amd64}"
BUILD_IMAGE="$IMAGE-build"
SUFFIX="$$"
NETWORK="packwright-verify-net-$SUFFIX"
MONGO="packwright-verify-mongo-$SUFFIX"
APP="packwright-verify-app-$SUFFIX"

cd "$(dirname "$0")/.."

TMP_DIR="$(mktemp -d)"

cleanup() {
  # -v removes the anonymous volumes mongo:8 declares (/data/db, /data/configdb);
  # without it every run leaks two.
  docker rm -f -v "$APP" "$MONGO" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  docker rmi "$BUILD_IMAGE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() {
  echo "FAIL: $1" >&2
  if docker inspect "$APP" >/dev/null 2>&1; then
    echo "--- last 40 lines of the app container log ---" >&2
    docker logs --tail 40 "$APP" >&2 || true
  fi
  exit 1
}

# search IMAGE ACCEPTED_RC SCRIPT: runs SCRIPT as root in the image and sets
# FOUND to whatever it printed. It fails unless the container ran and SCRIPT
# finished with an accepted exit status, so "could not search" is never mistaken
# for "found nothing".
search() {
  local out rc
  out="$(docker run --rm --platform "$PLATFORM" --user 0 --entrypoint sh "$1" -c "$3"'; echo "__rc=$?"')" || fail "could not run a container from $1"
  rc="$(printf '%s\n' "$out" | tail -n 1)"
  case " $2 " in
    *" ${rc#__rc=} "*) ;;
    *) fail "the search in $1 exited with '${rc#__rc=}' (accepted: $2), so it proves nothing" ;;
  esac
  FOUND="$(printf '%s\n' "$out" | sed '$d')"
}

echo "==> Building $IMAGE for $PLATFORM"
docker build --platform "$PLATFORM" -t "$IMAGE" . || fail "docker build failed"

echo "==> 1. No .env file anywhere in the image"
search "$IMAGE" "0" 'find / \( -path /proc -o -path /sys \) -prune -o -name ".env*" -print'
env_files="$FOUND"
if [ -n "$env_files" ]; then
  echo "$env_files" >&2
  fail "the image contains .env files (listed above)"
fi
echo "PASS: no .env files"

# Checks 1 and 1b both exist on purpose. The final stage copies only dist,
# node_modules and package.json files, so check 1 alone cannot see the build
# context: a real .env that slipped past .dockerignore would never show up in
# the final image. In the build stage it would still reach `npm run build` (Vite
# reads apps/web/.env*) and the build cache. .env.example files are allowed
# there because .dockerignore re-includes them.
echo "==> 1b. No real .env file in the build stage (the .dockerignore guard)"
docker build --platform "$PLATFORM" --target build -t "$BUILD_IMAGE" . || fail "docker build --target build failed"
search "$BUILD_IMAGE" "0" 'find / \( -path /proc -o -path /sys \) -prune -o -name ".env*" -not -name ".env.example" -print'
build_env_files="$FOUND"
if [ -n "$build_env_files" ]; then
  echo "$build_env_files" >&2
  fail "the build stage contains real .env files (listed above)"
fi
echo "PASS: no real .env files in the build stage"

echo "==> 2. Runs as a non-root user"
uid="$(docker run --rm --platform "$PLATFORM" --entrypoint id "$IMAGE" -u)"
[ "$uid" != "0" ] || fail "the image runs as root"
echo "PASS: uid $uid"

echo "==> 3. NODE_ENV=production on Node 24, npm 11 or newer"
runtime="$(docker run --rm --platform "$PLATFORM" --entrypoint node "$IMAGE" -p 'process.env.NODE_ENV + " " + process.versions.node.split(".")[0]')"
[ "$runtime" = "production 24" ] || fail "expected 'production 24', got '$runtime'"
npm_major="$(docker run --rm --platform "$PLATFORM" --entrypoint npm "$IMAGE" --version | cut -d. -f1)"
[ "$npm_major" -ge 11 ] 2>/dev/null || fail "npm major version is '$npm_major', expected 11 or newer"
echo "PASS: $runtime, npm major $npm_major"

echo "==> 4. No key or site key baked into the client bundle"
search "$IMAGE" "0 1" '( test -d /app/apps/api/dist/public || exit 99; grep -rlE "sk-ant-|1x00000000000000000000AA" /app/apps/api/dist/public )'
baked="$FOUND"
if [ -n "$baked" ]; then
  echo "$baked" >&2
  fail "a key or site key is baked into the client (files listed above)"
fi
echo "PASS: nothing baked in"

# The server loads none of these: the client ships as built files, and tsx,
# typescript, esbuild and rollup are build tools the lockfile marks devOptional,
# so --omit=dev alone keeps them (the Dockerfile's deps stage says why). The
# test for express first makes sure this is looking at a real node_modules.
echo "==> 4b. Only the server's run-time packages in node_modules"
search "$IMAGE" "0" '( test -d /app/node_modules/express || exit 99; for p in vue vue-router pinia zxing-wasm barcode-detector vite typescript tsx esbuild rollup; do test -e "/app/node_modules/$p" && echo "$p"; done; true )'
extra="$FOUND"
if [ -n "$extra" ]; then
  echo "$extra" >&2
  fail "node_modules holds packages the server never loads (listed above)"
fi
echo "PASS: only the server's packages"

echo "==> 5. Boots read-only with all capabilities dropped, and serves"
docker network create "$NETWORK" >/dev/null
docker run -d --name "$MONGO" --network "$NETWORK" mongo:8 >/dev/null
docker run -d --name "$APP" --network "$NETWORK" --platform "$PLATFORM" \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges \
  -e "MONGODB_URI=mongodb://$MONGO:27017/packwright" \
  -p 127.0.0.1::3000 "$IMAGE" >/dev/null
port="$(docker port "$APP" 3000/tcp | head -n1 | sed 's/.*://')"
[ -n "$port" ] || fail "could not find the published port"
base="http://127.0.0.1:$port"

healthy=""
for _ in $(seq 1 60); do
  if [ "$(curl -s --max-time 2 -o /dev/null -w '%{http_code}' "$base/health" || true)" = "200" ]; then
    healthy=1
    break
  fi
  sleep 1
done
[ -n "$healthy" ] || fail "GET /health did not return 200 within 60 s"
echo "PASS: GET /health is 200"

curl -sf "$base/" | grep -q '<div id="app">' || fail 'GET / does not contain <div id="app">'
echo 'PASS: GET / serves the client'

curl -s -X POST "$base/api/labels/upc-a/export" \
  -H 'content-type: application/json' \
  -d '{"gtin":"036000291452"}' -o "$TMP_DIR/export.pdf" || fail "POST /api/labels/upc-a/export failed"
pdf_head="$(head -c 5 "$TMP_DIR/export.pdf")"
[ "$pdf_head" = "%PDF-" ] || fail "POST /api/labels/upc-a/export did not return a PDF (got '$pdf_head')"
echo "PASS: the export returns a PDF"

echo "PASS: $IMAGE ($PLATFORM) is fit to ship"

# syntax=docker/dockerfile:1
#
# The production image: one container, the API serving the built client.
# Three stages: build everything, install the API's run-time dependencies
# alone, then copy the two together into a clean image.
#
# node:24-slim is pinned by digest, read with `docker inspect` on 2026-11-19.
# Bump the tag and digest together, on purpose.

FROM node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS build
WORKDIR /app
# mongodb-memory-server downloads a mongod in its postinstall. The tests use it;
# the image never does.
ENV MONGOMS_DISABLE_POSTINSTALL=1
# Manifests first, so the install layer is reused until a dependency changes.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/label-core/package.json packages/label-core/
RUN npm ci
# .dockerignore keeps every .env file out of this copy, except .env.example.
COPY . .
# The root build: the web app first, then tsup copies web/dist into api/dist/public and the fonts into api/dist.
RUN npm run build

# The run-time dependencies, installed for the API workspace alone. Pruning the
# full install would keep the web workspace's dependencies too (vue, pinia,
# zxing-wasm and the rest), which the server never loads: the client ships as
# the built files in api/dist/public. --omit=optional as well, because the
# lockfile marks the build tools (tsx, typescript, esbuild, rollup) devOptional,
# which --omit=dev alone keeps; nothing the bundle imports is optional.
# scripts/verify-image.sh fails if any of them comes back.
FROM node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/label-core/package.json packages/label-core/
RUN npm ci --omit=dev --omit=optional --workspace=@packwright/api --include-workspace-root=false

FROM node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
# The bundle imports express, mongoose, pdfkit and the rest from node_modules at
# run time: only label-core is bundled (apps/api/tsup.config.ts, noExternal).
COPY --from=deps /app/node_modules ./node_modules
# The workspace package.json files keep the node_modules/@packwright/* links valid.
COPY --from=deps /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=deps /app/packages/label-core/package.json packages/label-core/
# Files stay owned by root, so the app cannot rewrite itself; only the user changes.
USER node
EXPOSE 3000
# Exec form, so node is PID 1 and receives SIGTERM directly. The server's handler
# for it arrives in a later task (plan Task 12); until then `docker stop` waits
# out the grace period before killing it.
CMD ["node", "--enable-source-maps", "--max-old-space-size=512", "apps/api/dist/server.js"]

# syntax=docker/dockerfile:1
#
# The production image: one container, the API serving the built client.
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
RUN npm run build && npm prune --omit=dev

FROM node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
# The bundle imports express, mongoose, pdfkit and the rest from node_modules at
# run time: only label-core is bundled (apps/api/tsup.config.ts, noExternal).
COPY --from=build /app/node_modules ./node_modules
# The workspace package.json files keep the node_modules/@packwright/* links valid.
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/package.json apps/web/
COPY --from=build /app/packages/label-core/package.json packages/label-core/
# Files stay owned by root, so the app cannot rewrite itself; only the user changes.
USER node
EXPOSE 3000
# Exec form, so node is PID 1 and receives SIGTERM directly. The server's handler
# for it arrives in a later task (plan Task 12); until then `docker stop` waits
# out the grace period before killing it.
CMD ["node", "--enable-source-maps", "--max-old-space-size=512", "apps/api/dist/server.js"]

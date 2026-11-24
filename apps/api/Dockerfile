# API container image (EST-02.3). Build from the repository root:
#   docker build -f apps/api/Dockerfile -t trs-api .
# The base image is pinned by digest; Dependabot (docker ecosystem) proposes updates.

# node:24.22.3-alpine3.24
FROM node:24.22.3-alpine3.24@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS build
ENV CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /repo

# pnpm comes from the "packageManager" field of the root package.json, through Corepack.
COPY package.json ./
RUN corepack enable && corepack install

# .dockerignore keeps the context to the workspace manifests, the lockfile and apps/api.
COPY . .
# Install scripts are not needed to compile the API (only esbuild has one, for the tests).
RUN pnpm install --frozen-lockfile --ignore-scripts --filter "@trs/api..." \
 && pnpm --filter "@trs/api..." build \
 && pnpm --filter @trs/api deploy --prod --legacy --ignore-scripts /prod/api

# node:24.22.3-alpine3.24
FROM node:24.22.3-alpine3.24@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS runtime
# The API runs on node alone: removing npm, Corepack and Yarn shrinks the image and the scan surface.
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-* \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app

# Files stay owned by root, so the process cannot modify its own code.
COPY --from=build /repo/apps/api/package.json ./package.json
COPY --from=build /prod/api/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
# SQL migrations, applied by `node dist/db/migrate-cli.js` with the owner's DATABASE_MIGRATION_URL.
COPY --from=build /repo/apps/api/drizzle ./drizzle

# Unprivileged user shipped with the base image (uid 1000).
USER node
EXPOSE 3000
# No curl in the image: Node's built-in fetch probes the liveness route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --start-interval=2s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/server.js"]

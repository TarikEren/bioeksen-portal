# The image of Bioeksen Portal (sds-ci, The container image; DEC-135).
#
# Stages: dependencies, build, and the runtime. Only the runtime stage's files
# are in the app image. The image holds no secret, no `.env` file and no
# migration: the settings arrive at run time, and the migrations run from the
# `migrate` target, which is a separate image (see below). The worker and the
# bootstrap command run from the `worker` target (see below).
#
#   docker build --target runtime -t bioeksen-portal .
#   docker build --target migrate -t bioeksen-portal-migrate .
#   docker build --target worker -t bioeksen-portal-worker .
#
# `runtime` is the last stage, so a build with no `--target` gives the app image.

# Node 24 (`.nvmrc`), pinned by the digest of the multi-platform index. To move
# the pin, read the new digest of `node:24-bookworm-slim` and change it here.
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205


FROM ${NODE_IMAGE} AS base
# The build tools send no telemetry.
ENV NEXT_TELEMETRY_DISABLED=1 \
    PRISMA_DISABLE_TELEMETRY=1 \
    DO_NOT_TRACK=1
# The version of pnpm is the one of `packageManager` in `package.json`.
RUN corepack enable
WORKDIR /app


# Dependencies: only the files that decide the install, so the layer holds until
# the lockfile changes. The install follows the lockfile.
FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile


# Build: the standalone output of Next.js (`output: "standalone"`), and the
# bundles of the worker and of the bootstrap command (`src/scripts/build-worker.ts`).
FROM dependencies AS build
COPY . .
RUN pnpm run build && pnpm run build:worker


# Migrations: the Prisma CLI, the contract and the migration files. No app code
# runs here. It is a one-shot image for `compose.demo.yaml` and for a release's
# deployment step; it never runs beside the app. `DATABASE_URL` arrives at run
# time. The app image does not hold the migration files.
#
# The Prisma CLI pulls in cloud SDKs, a worker runtime and the tools of the
# build, which it does not load to apply a migration. They are 1.6 GB of 2.1 GB.
# The install follows the lockfile, and the same step removes the packages that
# the CLI does not need, and the package store, so the layer is small (about
# 0.5 GB). `prisma contract emit` then
# loads the toolchain: the build fails if a package that it needs was removed.
FROM base AS migrate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile \
 && cd node_modules/.pnpm \
 && rm -rf alchemy@* @distilled.cloud+* @cloudflare+* @next+* @playwright+* @heroui+* @adobe+* @spectrum-icons+* \
           @vitest+* @img+* next@* playwright@* playwright-core@* react-aria@* react-aria-components@* \
           react-stately@* typescript@* vitest@* jsdom@* \
 && rm -rf "$(pnpm store path)"
COPY prisma.config.ts ./
COPY src/prisma ./src/prisma
RUN node_modules/.bin/prisma contract emit
USER node
CMD ["node_modules/.bin/prisma", "db", "migrate", "--yes"]


# Worker: the worker process (PLT-30) and the bootstrap command (ACC-40). The two
# bundles come from the build stage. The packages stay outside the bundles, so
# the image holds the production packages of the lockfile and nothing of the
# development tools. `--conditions=react-server` makes `import "server-only"`
# empty in a plain Node.js process. The default command is the worker; the
# bootstrap step of `compose.demo.yaml` runs `worker/bootstrap.mjs` instead.
FROM base AS worker-dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM ${NODE_IMAGE} AS worker
ENV NODE_ENV=production     NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=worker-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next/worker ./worker
COPY --from=build --chown=node:node /app/.bioeksen/software-id ./.bioeksen/software-id
USER node
CMD ["node", "--conditions=react-server", "worker/main.mjs"]


# Runtime: the server that the build traced, its static files, and the software
# id, which the server reads from the working directory at start.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/.bioeksen/software-id ./.bioeksen/software-id
# The `node` user of the base image has the id 1000 and no shell login.
USER node
EXPOSE 3000
CMD ["node", "server.js"]

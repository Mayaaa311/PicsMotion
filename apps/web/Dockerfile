# Web app (Next.js). Build context is the repo ROOT so workspace packages resolve.
#   docker build -f apps/web/Dockerfile -t interactive-photo-web .
FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo

# ---- deps ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/package.json
COPY packages/scene-schema/package.json packages/scene-schema/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/presets/package.json packages/presets/package.json
COPY packages/scene-runtime/package.json packages/scene-runtime/package.json
COPY packages/effects/package.json packages/effects/package.json
COPY packages/audio-engine/package.json packages/audio-engine/package.json
COPY packages/interaction-engine/package.json packages/interaction-engine/package.json
COPY packages/editor-ui/package.json packages/editor-ui/package.json
RUN pnpm install --filter @interactive-photo/web... --prefer-offline

# ---- build ----
FROM base AS build
COPY --from=deps /repo /repo
COPY . .
RUN pnpm install --filter @interactive-photo/web... --offline || pnpm install --filter @interactive-photo/web...
RUN pnpm --filter @interactive-photo/web build

# ---- run ----
FROM base AS run
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]

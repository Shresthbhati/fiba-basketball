# Build from the repository root:  docker build -f services/api/Dockerfile -t courtiq-api .
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
# Workspace manifests first so dependency installation is cached until they change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY services/api/package.json services/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @courtiq/api...
COPY services/api services/api
# Compile, then assemble a self-contained folder with production dependencies only (dist/ + drizzle/ migrations).
RUN pnpm --filter @courtiq/api build \
 && pnpm --filter @courtiq/api deploy --legacy --prod /out \
 && rm -rf /out/src /out/test

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out /app
# Uploaded game film. Mount a persistent volume here; a named volume inherits this ownership on first use.
RUN mkdir -p /data/media && chown node:node /data/media
ENV MEDIA_DIR=/data/media
VOLUME /data/media
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Applies database migrations on start, then listens. Refuses to start if production settings are missing (see docs/operations/runbook.md).
CMD ["node", "dist/main.js"]

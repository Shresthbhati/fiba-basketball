# Build from the repository root:  docker build -f apps/web/Dockerfile --build-arg API_URL=http://api:3001 -t courtiq-web .
# API_URL is baked into the build (it is where /api/* requests are proxied to), so it is a build argument.
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
ARG API_URL=http://api:3001
ENV API_URL=$API_URL NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY services/api/package.json services/api/
RUN pnpm install --frozen-lockfile --filter @courtiq/web...
COPY apps/web apps/web
RUN pnpm --filter @courtiq/web build \
 && pnpm --filter @courtiq/web deploy --legacy --prod /out \
 && cp -r apps/web/.next /out/.next && rm -rf /out/.next/cache /out/test /out/lib /out/app

FROM node:22-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /out /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node_modules/.bin/next", "start", "-p", "3000"]

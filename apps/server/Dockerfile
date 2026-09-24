# Build from the repository root:
#   docker build -f apps/server/Dockerfile -t gridlock-server .
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/server/package.json apps/server/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --workspace=@gridlock/server --workspace=@gridlock/engine --include-workspace-root=false --no-audit --no-fund
COPY packages/engine packages/engine
COPY apps/server apps/server
RUN npm run build -w @gridlock/server \
 && npm prune --omit=dev --workspace=@gridlock/server --no-audit --no-fund

FROM node:22-alpine
ENV NODE_ENV=production PORT=2567
WORKDIR /app
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /repo/apps/server/dist ./apps/server/dist
COPY --from=build /repo/apps/server/package.json ./apps/server/package.json
WORKDIR /app/apps/server
USER node
EXPOSE 2567
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1
CMD ["node", "dist/index.js"]

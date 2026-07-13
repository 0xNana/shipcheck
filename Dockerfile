# syntax=docker/dockerfile:1

FROM node:22-bookworm AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages ./packages
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY apps ./apps
COPY developer-docs/config ./developer-docs/config
RUN pnpm --filter @shipcheck/web build
RUN pnpm --filter @shipcheck/api build

FROM mcr.microsoft.com/playwright:v1.54.1-noble AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN groupadd --system shipcheck && useradd --system --gid shipcheck shipcheck \
  && CHROMIUM="$(find /ms-playwright -name chrome -type f | head -1)" \
  && ln -sf "${CHROMIUM}" /usr/local/bin/shipcheck-chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/local/bin/shipcheck-chromium

USER shipcheck

COPY --from=build --chown=shipcheck:shipcheck /app/node_modules ./node_modules
COPY --from=build --chown=shipcheck:shipcheck /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=shipcheck:shipcheck /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=shipcheck:shipcheck /app/apps/web/dist ./apps/web/dist
COPY --from=build --chown=shipcheck:shipcheck /app/packages ./packages
COPY --from=build --chown=shipcheck:shipcheck /app/developer-docs/config ./developer-docs/config
COPY --from=build --chown=shipcheck:shipcheck /app/package.json ./package.json
COPY --from=build --chown=shipcheck:shipcheck /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/server.js"]

# Base images pinned by digest, kept up to date by Dependabot (docker ecosystem).
# Alpine: the Debian slim image carried unfixed HIGH findings (util-linux, gzip) that Trivy blocks on.
# Build context: the repo root (docker build -f backend/Dockerfile .), so the image installs from the root
# package-lock.json, the one the pipeline tests (RSK-05). backend/Dockerfile.dockerignore keeps the rest out.
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS deps
WORKDIR /app
# npm ci checks the lockfile against every workspace it lists, so their package.json come too
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY test/e2e/package.json test/e2e/
# production dependencies of the backend workspace only, no lifecycle script (none is needed)
RUN npm ci --omit=dev --workspace=taskora-backend --ignore-scripts \
  && mkdir -p backend/node_modules && npm cache clean --force

FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
ENV NODE_ENV=production
# npm, npx and corepack are not needed to run the API and bring their own vulnerable dependencies;
# OS packages are upgraded to their fixed versions at build time
RUN apk upgrade --no-cache \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg \
  && mkdir -p /data/uploads && chown -R 1000:1000 /data
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY backend/package.json ./backend/
COPY backend/src ./backend/src
WORKDIR /app/backend
ENV PORT=3001
# DATABASE_URL and JWT_SECRET have no default in the image, they come from the runtime
# environment (docker-compose.yml builds DATABASE_URL from POSTGRES_PASSWORD)
ENV UPLOAD_DIR=/data/uploads
# run as the unprivileged node user of the image (uid 1000), owner of /data only
USER 1000:1000
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/api/health').then(function (r) { process.exit(r.ok ? 0 : 1); }, function () { process.exit(1); })"]
CMD ["node", "src/index.js"]

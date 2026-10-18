# Base images pinned by digest, kept up to date by Dependabot (docker ecosystem).
# Build context: the repo root (docker build -f frontend/Dockerfile .), so the image installs from the root
# package-lock.json, the one the pipeline tests (RSK-05). frontend/Dockerfile.dockerignore keeps the rest out.
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS build
WORKDIR /app
# npm ci checks the lockfile against every workspace it lists, so their package.json come too
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY test/e2e/package.json test/e2e/
# dependencies of the frontend workspace only, without lifecycle scripts
RUN npm ci --workspace=taskora-frontend --ignore-scripts
COPY frontend/ frontend/
RUN npm run build --workspace=taskora-frontend

# nginx without root (uid 101), listening on 8080
FROM nginxinc/nginx-unprivileged:1.29-alpine-slim@sha256:59678856b05324b7f6371f26eb1520be7fcd8bdc8ab380fc4913db8503e5a842
USER 0
# OS packages upgraded to their fixed versions at build time (Trivy blocks on HIGH and CRITICAL)
RUN apk upgrade --no-cache
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/"]

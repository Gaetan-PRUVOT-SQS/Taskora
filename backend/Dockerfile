FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV PORT=3001
ENV DATABASE_URL=postgresql://taskora:taskora@postgres:5432/taskora
ENV UPLOAD_DIR=/data/uploads
# run as the unprivileged user of the node image; the uploads dir is created
# here so a fresh volume mounted on /data gets the right owner
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3001
CMD ["node", "src/index.js"]

FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV PORT=3001
ENV DATABASE_URL=postgresql://taskora:taskora@postgres:5432/taskora
ENV UPLOAD_DIR=/data/uploads
ENV JWT_SECRET=change-me-in-production
EXPOSE 3001
CMD ["node", "src/index.js"]

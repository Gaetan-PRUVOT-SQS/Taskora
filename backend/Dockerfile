FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
# le code reste à root et en lecture seule pour l'utilisateur qui fait tourner l'API
COPY src ./src
# seul le dossier de données appartient à node (uid 1000)
RUN mkdir -p /data/uploads \
  && chown -R 1000:1000 /data \
  && chmod 700 /data /data/uploads
ENV PORT=3001
ENV DATABASE_URL=postgresql://taskora:taskora@postgres:5432/taskora
ENV UPLOAD_DIR=/data/uploads
# utilisateur node de l'image (uid 1000)
USER 1000:1000
EXPOSE 3001
CMD ["node", "src/index.js"]

FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
RUN mkdir -p /data/uploads && chown -R node:node /app /data
ENV PORT=3001
ENV UPLOAD_DIR=/data/uploads
USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=10 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]

# ── KuralAI Backend Dockerfile ─────────────────────────────────────────────────
FROM node:20-alpine AS base

# Install system dependencies (ffmpeg for audio processing)
RUN apk add --no-cache ffmpeg python3 make g++

WORKDIR /app

# ── Dependencies ────────────────────────────────────────────────────────────────
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production

# ── Production image ────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup -S kuralai && adduser -S kuralai -G kuralai

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create logs directory
RUN mkdir -p logs && chown -R kuralai:kuralai /app

USER kuralai

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]

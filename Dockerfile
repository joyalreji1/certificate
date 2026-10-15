# Multi-stage production build for Bulk Certificate Generator
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency specifications first to leverage Docker layer caching
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/

RUN npm ci

# Copy full repository source
COPY . .

# Build all packages and applications (shared, server, web)
RUN npm run build

# Runtime Stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV STORAGE_DIR=/app/storage

# Install only production dependencies
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/

RUN npm ci --omit=dev

# Copy compiled outputs from builder
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Pre-create storage mount points
RUN mkdir -p /app/storage/db /app/storage/temp/uploads /app/storage/temp/jobs

EXPOSE 4000

# Start production server (auto-seeds default admin if database is new)
CMD ["node", "apps/server/dist/index.js"]

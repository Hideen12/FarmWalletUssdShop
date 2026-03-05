# FarmWallet Rice Shops - USSD Platform
# Production Dockerfile for deployment (HTTP + HTTPS/SSL)

FROM node:20-slim AS base

# Install dumb-init for proper signal handling
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Dependencies stage ---
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# --- Production build ---
FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3000

# HTTPS_PORT: use 3443 in container; map 443:3443 in docker-compose
# SSL paths are resolved by the app defaults or can be set at runtime.
ENV HTTPS_PORT=3443

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -s /bin/false nodejs

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Copy and set entrypoint
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Set ownership (including ssl/ if present)
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000 3443

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "src/server.js"]

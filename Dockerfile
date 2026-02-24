FROM node:20-slim AS builder

WORKDIR /app

# Install OpenSSL for Prisma Client generation
RUN apt-get update -y && apt-get install -y openssl

ENV PRISMA_CLI_QUERY_ENGINE_TYPE=binary
ENV PRISMA_CLI_ENGINE_TYPE=binary
ENV PRISMA_CLI_BINARY_TARGETS="debian-openssl-3.0.x"

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# ------------------------
# Runner Stage
# ------------------------
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Install OpenSSL for Prisma runtime
RUN apt-get update -y && apt-get install -y openssl

COPY --from=builder /app/package*.json ./  
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules

CMD sh -c "npx prisma migrate deploy && node dist/server.js"

EXPOSE 4000
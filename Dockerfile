# syntax=docker/dockerfile:1

FROM node:20-bullseye AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bullseye AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM node:20-bullseye AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3020

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/.next/standalone ./

EXPOSE 3020

CMD ["node", "server.js"]

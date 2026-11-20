# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN npm run build

FROM node:20-bookworm-slim AS production-deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim AS runtime
# The app defaults to 127.0.0.1 for local runs; inside a container it must
# listen on all interfaces or published ports cannot reach it.
ENV NODE_ENV=production \
    GRACC_HTTP_HOST=0.0.0.0
WORKDIR /app

COPY package.json package-lock.json ./
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3333

CMD ["node", "dist/http-server.js"]

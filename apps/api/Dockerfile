FROM node:22-alpine AS base
WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN npm config set registry "$NPM_REGISTRY" \
  && sed -i "s#https://registry.npmjs.org/#${NPM_REGISTRY%/}/#g" package-lock.json \
  && npm ci --no-audit --no-fund

COPY . .
RUN npm run build

EXPOSE 3100
CMD ["sh", "-c", "npm run prisma:generate && npm run prisma:migrate:deploy && npm run start:prod"]

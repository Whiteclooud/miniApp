FROM node:22-alpine AS base
WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3100
CMD ["sh", "-c", "npm run prisma:generate && npm run prisma:migrate:deploy && npm run start:prod"]

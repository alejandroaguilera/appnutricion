FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# lib/ y tsconfig.json (más devDependencies, ya en node_modules) permiten
# correr prisma/seed.ts vía tsx en este mismo contenedor — el seed es
# idempotente (se salta si ya hay catálogo), así que es seguro incluirlo en
# el arranque en vez de requerir un paso manual que este entorno no puede
# ejecutar (sin acceso a exec/shell del contenedor).
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/tsconfig.json ./tsconfig.json
EXPOSE 3000
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && npx tsx prisma/seed.ts && node server.js"]

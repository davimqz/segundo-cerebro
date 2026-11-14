# Imagem do painel (ADR 0005: construída no próprio servidor).
# Saída standalone do Next, roda como usuário sem root e aplica as migrações antes de abrir.

FROM node:26.13.0-trixie-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@12.6.0 && npm cache clean --force

FROM base AS dependencias
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .
RUN pnpm build && pnpm build:scripts

FROM base AS producao
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# O pnpm só roda os comandos de linha aqui: não deve tentar instalar nada antes (o disco é só leitura).
ENV pnpm_config_verify_deps_before_run=false
# Os arquivos ficam com dono root: o usuário node só lê, não altera o app.
# O servidor (com o node_modules) fica em /app/servidor. Na raiz ficam só o package.json dos comandos
# (pnpm usuario, pnpm aviso) e as migrações: sem node_modules na raiz, o pnpm não tenta instalar nada.
COPY --from=build /app/.next/standalone ./servidor
COPY --from=build /app/.next/static ./servidor/.next/static
COPY --from=build /app/dist-scripts ./servidor/dist-scripts
COPY --from=build /app/drizzle ./drizzle
COPY docker/package.json ./package.json
USER node
EXPOSE 3000
CMD ["sh", "-c", "node servidor/dist-scripts/migrar.mjs && exec node servidor/server.js"]

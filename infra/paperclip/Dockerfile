# Imagem final do Paperclip na Asttra (ADR 0006).
#
# Parte da imagem oficial da versão fixa, publicada pelo CI do Paperclip e fixada pelo digest
# (PAPERCLIP_IMAGEM no .env), e copia só o aplicativo (/app) para uma base limpa. Ficam de fora as
# CLIs de terceiros que a imagem oficial instala em @latest (Claude Code, Codex, Gemini, Kimi,
# OpenCode). O servidor não compila nada: compilar o Paperclip passa de 7 GB de memória.
ARG PAPERCLIP_IMAGEM
FROM ${PAPERCLIP_IMAGEM} AS oficial

FROM node:24.19.0-trixie-slim AS production
# tini é o PID 1 (recolhe processos órfãos, como na imagem oficial). git e ca-certificates
# servem aos workspaces do Paperclip.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git tini \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /paperclip \
  && chown node:node /paperclip

WORKDIR /app
# Os donos vêm da imagem oficial (/app é root; algumas subpastas, como /app/server, são do node).
COPY --from=oficial /app /app

ENV NODE_ENV=production \
  HOME=/paperclip \
  HOST=0.0.0.0 \
  PORT=3100 \
  SERVE_UI=true \
  PAPERCLIP_HOME=/paperclip \
  PAPERCLIP_INSTANCE_ID=default \
  PAPERCLIP_CONFIG=/paperclip/instances/default/config.json

USER node
EXPOSE 3100
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--import", "./server/node_modules/tsx/dist/loader.mjs", "server/dist/index.js"]

#!/usr/bin/env bash
# Testes de integração do painel: sobe um PostgreSQL 18 descartável (mesma imagem de infra/banco),
# roda `pnpm test:integracao` contra ele e apaga o container no fim.
#
# Precisa de: docker e as dependências do painel instaladas (pnpm install em painel/).
# Uso: bash scripts/teste-painel.sh
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGEM="postgres:18.6-trixie"
NOME="painel-teste-$$"
PORTA="${PAINEL_TESTE_PORTA:-55432}"
SENHA="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"

limpar() { docker rm -f "$NOME" >/dev/null 2>&1 || true; }
trap limpar EXIT

echo "== Subindo PostgreSQL de teste em 127.0.0.1:$PORTA"
docker run -d --name "$NOME" \
  -e POSTGRES_PASSWORD="$SENHA" -e POSTGRES_DB=painel_teste \
  -p "127.0.0.1:$PORTA:5432" "$IMAGEM" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$NOME" pg_isready -U postgres -d painel_teste -h 127.0.0.1 >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$NOME" pg_isready -U postgres -d painel_teste -h 127.0.0.1 >/dev/null ||
  { echo "PostgreSQL de teste não ficou pronto." >&2; docker logs "$NOME" >&2; exit 1; }

echo "== Testes de integração do painel"
cd "$RAIZ/painel"
DATABASE_URL="postgres://postgres:$SENHA@127.0.0.1:$PORTA/painel_teste" pnpm --silent test:integracao

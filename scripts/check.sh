#!/usr/bin/env bash
# Checagem única do projeto: lint, tipos e testes rápidos.
# Roda localmente, no hook Stop do Claude Code e no CI.
#
# Uso: bash scripts/check.sh            (ShellCheck, painel e, se houver docker e restic, os testes de integração)
#      CHECK_INTEGRACAO=1 bash scripts/check.sh   (exige os testes de integração; usado no CI)
# O E2E do painel fica fora, para a checagem continuar rápida: bash scripts/teste-e2e.sh
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

echo "== ShellCheck"
mapfile -t scripts < <(git ls-files '*.sh')
if command -v shellcheck >/dev/null; then
  shellcheck "${scripts[@]}"
elif command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  # MSYS_NO_PATHCONV evita que o Git Bash do Windows reescreva o caminho /src.
  MSYS_NO_PATHCONV=1 docker run --rm -v "$RAIZ:/src" -w /src koalaman/shellcheck:v0.11.0 "${scripts[@]}"
else
  echo "shellcheck não encontrado (nem docker para rodá-lo)." >&2
  exit 1
fi
echo "   ok (${#scripts[@]} scripts)"

echo "== Painel: tipos, lint, formatação e testes de unidade"
command -v pnpm >/dev/null || { echo "pnpm não encontrado (instale com: npm install -g pnpm)." >&2; exit 1; }
if [[ ! -d painel/node_modules ]]; then
  pnpm --dir painel install --frozen-lockfile
fi
pnpm --dir painel --silent typecheck
pnpm --dir painel --silent lint
pnpm --dir painel --silent format:check
pnpm --dir painel --silent test
echo "   ok"

echo "== Testes de integração do painel"
if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  bash scripts/teste-painel.sh
elif [[ "${CHECK_INTEGRACAO:-0}" == "1" ]]; then
  echo "Os testes de integração do painel exigem docker." >&2
  exit 1
else
  echo "   pulado: precisa de docker (no CI ele sempre roda)."
fi

echo "== Teste de integração do banco"
if command -v docker >/dev/null && command -v restic >/dev/null && docker info >/dev/null 2>&1; then
  bash scripts/teste-banco.sh
elif [[ "${CHECK_INTEGRACAO:-0}" == "1" ]]; then
  echo "O teste de integração exige docker e restic." >&2
  exit 1
else
  echo "   pulado: precisa de docker e restic (no CI ele sempre roda)."
fi

#!/usr/bin/env bash
# Checagem única do projeto: lint, tipos e testes rápidos.
# Roda localmente, no hook Stop do Claude Code e no CI.
#
# Uso: bash scripts/check.sh            (ShellCheck, painel e, se houver docker e restic, os testes de integração)
#      CHECK_INTEGRACAO=1 bash scripts/check.sh   (exige os testes de integração; usado no CI)
# O E2E do painel fica fora, para a checagem continuar rápida: bash scripts/teste-e2e.sh
# O teste do Paperclip também fica fora (baixa uma imagem de ~2,5 GB): bash scripts/teste-paperclip.sh
# (no CI ele roda pelo workflow paperclip.yml quando infra/paperclip muda).
# O teste do Hermes também (sobe banco, Paperclip e Hermes): bash scripts/teste-hermes.sh
# (no CI ele roda pelo workflow hermes.yml quando infra/hermes muda).
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

echo "== MCP do Paperclip para o Hermes: testes de unidade"
PYTHON="$(command -v python3 || command -v python || true)"
[[ -n "$PYTHON" ]] || { echo "python3 não encontrado." >&2; exit 1; }
PYTHONIOENCODING=utf-8 "$PYTHON" -m unittest discover -s infra/hermes/mcp-paperclip -q
echo "   ok"

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

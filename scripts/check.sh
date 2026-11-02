#!/usr/bin/env bash
# Checagem única do projeto: lint, tipos e testes rápidos.
# Roda localmente, no hook Stop do Claude Code e no CI.
#
# Uso: bash scripts/check.sh            (ShellCheck; teste do banco se docker e restic existirem)
#      CHECK_INTEGRACAO=1 bash scripts/check.sh   (exige o teste do banco; usado no CI)
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

echo "== Teste de integração do banco"
if command -v docker >/dev/null && command -v restic >/dev/null && docker info >/dev/null 2>&1; then
  bash scripts/teste-banco.sh
elif [[ "${CHECK_INTEGRACAO:-0}" == "1" ]]; then
  echo "O teste de integração exige docker e restic." >&2
  exit 1
else
  echo "   pulado: precisa de docker e restic (no CI ele sempre roda)."
fi

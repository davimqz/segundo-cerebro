#!/usr/bin/env bash
# Roda só na primeira inicialização do PostgreSQL (volume vazio), pelo docker-entrypoint-initdb.d.
# Cria um usuário e um banco por serviço. Cada usuário só conecta no próprio banco.
set -euo pipefail

criar() {
  local nome="$1" senha="$2"
  if [[ -z "$senha" ]]; then
    echo "Senha do usuário $nome vazia. Confira o .env." >&2
    exit 1
  fi
  # A senha vai como variável do psql (:'senha'), que faz o escape correto.
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
    -v nome="$nome" -v senha="$senha" <<'SQL'
CREATE ROLE :"nome" LOGIN PASSWORD :'senha';
CREATE DATABASE :"nome" OWNER :"nome";
REVOKE CONNECT ON DATABASE :"nome" FROM PUBLIC;
SQL
  echo "Banco e usuário criados: $nome"
}

criar painel "${PAINEL_DB_PASSWORD:-}"
criar n8n "${N8N_DB_PASSWORD:-}"
criar paperclip "${PAPERCLIP_DB_PASSWORD:-}"

#!/usr/bin/env bash
# Teste de restauração: baixa um snapshot do restic e restaura cada banco, um de cada vez,
# num banco separado (restauracao_teste). Compara a contagem de linhas por tabela com o
# original. O banco de produção só é lido, nunca alterado.
#
# Uso: sudo /opt/asttra/banco/backup/restaurar.sh [ID_DO_SNAPSHOT]   (padrão: o último)
#
# As contagens só batem se ninguém escreveu no banco desde o backup. Rode logo depois de
# um backup manual, ou num horário sem uso.
set -euo pipefail

DIR_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ENV="${BACKUP_ENV:-$DIR_SCRIPT/backup.env}"
BANCO_DIR="${BANCO_DIR:-$(dirname "$DIR_SCRIPT")}"
SNAPSHOT="${1:-latest}"
TESTE="restauracao_teste"

if [[ -f "$BACKUP_ENV" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$BACKUP_ENV"
  set +a
fi

: "${RESTIC_REPOSITORY:?defina RESTIC_REPOSITORY no backup.env}"
: "${RESTIC_PASSWORD:?defina RESTIC_PASSWORD no backup.env}"

pg() {
  docker compose --project-directory "$BANCO_DIR" exec -T postgres "$@"
}

apagar_teste() {
  docker compose --project-directory "$BANCO_DIR" exec -T -e PGOPTIONS="-c client_min_messages=warning" \
    postgres psql -v ON_ERROR_STOP=1 -U postgres -d postgres -qc "DROP DATABASE IF EXISTS $TESTE WITH (FORCE)"
}

TMP="$(mktemp -d /tmp/asttra-restauracao.XXXXXX)"
chmod 700 "$TMP"

finalizar() {
  local codigo=$?
  apagar_teste || echo "Aviso: não consegui apagar o banco $TESTE." >&2
  rm -rf "$TMP"
  exit "$codigo"
}
trap finalizar EXIT

# Contagem exata de linhas de cada tabela, no formato "schema.tabela|linhas".
contar() {
  pg psql -v ON_ERROR_STOP=1 -U postgres -d "$1" -At <<'SQL'
SELECT table_schema || '.' || table_name || '|' ||
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name),
                           false, true, '')))[1]::text
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY 1;
SQL
}

echo "Restaurando o snapshot '$SNAPSHOT' em $TMP."
restic restore "$SNAPSHOT" --host asttra-banco --tag banco --target "$TMP"

if [[ ! -s "$(find "$TMP" -name globals.sql -print -quit)" ]]; then
  echo "O snapshot não tem o globals.sql (usuários e permissões)." >&2
  exit 1
fi

mapfile -t dumps < <(find "$TMP" -name '*.dump' | sort)
if [[ ${#dumps[@]} -eq 0 ]]; then
  echo "O snapshot não tem nenhum dump de banco." >&2
  exit 1
fi

diferencas=0
for dump in "${dumps[@]}"; do
  banco="$(basename "$dump" .dump)"
  echo "== $banco"
  apagar_teste
  pg psql -v ON_ERROR_STOP=1 -U postgres -d postgres -qc "CREATE DATABASE $TESTE"
  pg pg_restore -U postgres -d "$TESTE" --no-owner --no-acl --exit-on-error <"$dump"

  contar "$banco" >"$TMP/original.txt"
  contar "$TESTE" >"$TMP/restaurado.txt"
  if diff -u "$TMP/original.txt" "$TMP/restaurado.txt"; then
    echo "   $(wc -l <"$TMP/original.txt") tabela(s), contagens iguais."
  else
    echo "   Contagens diferentes em $banco (acima: - original, + restaurado)." >&2
    diferencas=1
  fi
done

if [[ $diferencas -ne 0 ]]; then
  echo "Restauração com diferenças." >&2
  exit 1
fi
echo "Restauração OK: contagens iguais em todos os bancos."

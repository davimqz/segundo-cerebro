#!/usr/bin/env bash
# Backup diário do PostgreSQL para o Cloudflare R2, com restic.
# Roda pelo timer do systemd (asttra-backup.timer) ou à mão: sudo /opt/asttra/banco/backup/backup.sh
#
# Passos: avisa o início ao Healthchecks.io, gera os dumps, envia ao restic, aplica a retenção
# e avisa sucesso ou falha. Os dumps temporários são apagados em qualquer caso.
#
# Variáveis (de backup.env, ver backup.env.example):
#   RESTIC_REPOSITORY, RESTIC_PASSWORD, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, HC_PING_URL
# Opcionais:
#   BACKUP_ENV  arquivo de variáveis (padrão: backup.env ao lado deste script)
#   BANCO_DIR   pasta do compose.yml (padrão: a pasta acima deste script)
#   HC_PING_URL vazia desliga os avisos (usado no teste de integração)
set -euo pipefail

DIR_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ENV="${BACKUP_ENV:-$DIR_SCRIPT/backup.env}"
BANCO_DIR="${BANCO_DIR:-$(dirname "$DIR_SCRIPT")}"

if [[ -f "$BACKUP_ENV" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$BACKUP_ENV"
  set +a
fi

: "${RESTIC_REPOSITORY:?defina RESTIC_REPOSITORY no backup.env}"
: "${RESTIC_PASSWORD:?defina RESTIC_PASSWORD no backup.env}"
HC_PING_URL="${HC_PING_URL:-}"

# Avisa o Healthchecks.io. Uma falha no aviso não derruba o backup.
avisar() {
  local sufixo="$1"
  [[ -z "$HC_PING_URL" ]] && return 0
  curl -fsS -m 10 --retry 5 -o /dev/null "$HC_PING_URL$sufixo" ||
    echo "Aviso: não consegui avisar o Healthchecks.io ($sufixo)." >&2
}

TMP="$(mktemp -d /tmp/asttra-backup.XXXXXX)"
chmod 700 "$TMP"

finalizar() {
  local codigo=$?
  rm -rf "$TMP"
  if [[ $codigo -eq 0 ]]; then
    echo "Backup concluído."
    avisar ""
  else
    echo "Backup FALHOU (código $codigo)." >&2
    avisar "/fail"
  fi
  exit "$codigo"
}
trap finalizar EXIT

# psql/pg_dump dentro do container, pelo socket local, como superusuário.
pg() {
  docker compose --project-directory "$BANCO_DIR" exec -T postgres "$@"
}

echo "1/4 Avisando o início."
avisar "/start"

echo "2/4 Gerando os dumps em $TMP."
mkdir "$TMP/dumps"
pg pg_dumpall -U postgres --globals-only >"$TMP/dumps/globals.sql"

mapfile -t bancos < <(pg psql -U postgres -d postgres -Atc \
  "SELECT datname FROM pg_database
   WHERE NOT datistemplate AND datname NOT IN ('postgres', 'restauracao_teste')
   ORDER BY datname")
if [[ ${#bancos[@]} -eq 0 ]]; then
  echo "Nenhum banco encontrado para copiar." >&2
  exit 1
fi
for banco in "${bancos[@]}"; do
  echo "   - $banco"
  pg pg_dump -U postgres -Fc "$banco" >"$TMP/dumps/$banco.dump"
done

echo "3/4 Enviando ao restic e aplicando a retenção."
# --host fixo, para o nome da máquina não importar. A retenção agrupa por host e tag, e não
# pelo caminho (o padrão do restic), porque o diretório temporário muda a cada execução.
(cd "$TMP" && restic backup --host asttra-banco --tag banco dumps)
restic forget --host asttra-banco --tag banco --group-by host,tags \
  --keep-daily 7 --keep-weekly 4 --prune

echo "4/4 Avisando o resultado."

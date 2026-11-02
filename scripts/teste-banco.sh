#!/usr/bin/env bash
# Teste de integração de infra/banco: sobe o compose com senhas de teste, confere o isolamento
# dos bancos e a senha do Redis, roda backup.sh num repositório restic local (sem R2 e sem
# Healthchecks.io), roda restaurar.sh e confere que uma falha termina com erro e limpa os dumps.
#
# Precisa de: docker (com compose), restic e a porta 127.0.0.1:5432 livre.
# Uso: bash scripts/teste-banco.sh
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d /tmp/teste-banco.XXXXXX)"
export COMPOSE_PROJECT_NAME="banco-teste"
REDE_CRIADA=0

falhar() {
  echo "FALHOU: $*" >&2
  exit 1
}

limpar() {
  local codigo=$?
  if [[ $codigo -ne 0 && -d "$TMP/banco" ]]; then
    echo "--- logs dos containers ---" >&2
    docker compose --project-directory "$TMP/banco" logs --tail 50 >&2 || true
  fi
  docker compose --project-directory "$TMP/banco" down -v --remove-orphans >/dev/null 2>&1 || true
  if [[ $REDE_CRIADA -eq 1 ]]; then
    docker network rm asttra >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP"
  exit "$codigo"
}
trap limpar EXIT

command -v docker >/dev/null || falhar "docker não encontrado"
command -v restic >/dev/null || falhar "restic não encontrado"

echo "== Preparando cópia de infra/banco com senhas de teste"
cp -r "$RAIZ/infra/banco" "$TMP/banco"
senha() { head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
declare -A SENHAS=([painel]="$(senha)" [n8n]="$(senha)" [paperclip]="$(senha)")
REDIS_SENHA="$(senha)"
cat >"$TMP/banco/.env" <<EOF
POSTGRES_PASSWORD=$(senha)
PAINEL_DB_PASSWORD=${SENHAS[painel]}
N8N_DB_PASSWORD=${SENHAS[n8n]}
PAPERCLIP_DB_PASSWORD=${SENHAS[paperclip]}
REDIS_PASSWORD=$REDIS_SENHA
EOF

if ! docker network inspect asttra >/dev/null 2>&1; then
  docker network create asttra >/dev/null
  REDE_CRIADA=1
fi

dc() { docker compose --project-directory "$TMP/banco" "$@"; }

echo "== Subindo PostgreSQL e Redis"
dc up -d --wait --wait-timeout 120

echo "== Portas"
[[ "$(dc port postgres 5432)" == "127.0.0.1:5432" ]] || falhar "PostgreSQL deveria publicar só 127.0.0.1:5432"
portas_redis="$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$(dc ps -q redis)")"
[[ "$portas_redis" == "{}" || "$portas_redis" == "null" ]] ||
  falhar "Redis não deveria publicar porta: $portas_redis"
echo "   ok"

echo "== Cada usuário conecta só no próprio banco"
conecta() {
  dc exec -T -e PGPASSWORD="${SENHAS[$1]}" postgres \
    psql -h 127.0.0.1 -U "$1" -d "$2" -Atc "SELECT 1" >/dev/null 2>&1
}
for usuario in painel n8n paperclip; do
  for banco in painel n8n paperclip; do
    if [[ "$usuario" == "$banco" ]]; then
      conecta "$usuario" "$banco" || falhar "$usuario deveria conectar em $banco"
    elif conecta "$usuario" "$banco"; then
      falhar "$usuario não deveria conectar em $banco"
    fi
  done
done
echo "   ok"

echo "== Redis recusa conexão sem senha"
dc exec -T redis redis-cli ping 2>&1 | grep -q NOAUTH || falhar "Redis aceitou conexão sem senha"
dc exec -T -e REDISCLI_AUTH="$REDIS_SENHA" redis redis-cli ping | grep -q PONG ||
  falhar "Redis recusou a senha correta"
dc exec -T -e REDISCLI_AUTH="$REDIS_SENHA" redis redis-cli config get maxmemory-policy |
  grep -q noeviction || falhar "Redis sem maxmemory-policy noeviction"
echo "   ok"

echo "== Dados de exemplo no banco painel"
dc exec -T -e PGPASSWORD="${SENHAS[painel]}" postgres \
  psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U painel -d painel -q <<'SQL'
CREATE TABLE exemplo (id serial PRIMARY KEY, nome text NOT NULL);
INSERT INTO exemplo (nome) SELECT 'linha ' || g FROM generate_series(1, 42) g;
SQL
echo "   ok"

echo "== Dados continuam depois de recriar os containers"
dc down >/dev/null 2>&1
dc up -d --wait --wait-timeout 120 >/dev/null 2>&1
linhas="$(dc exec -T postgres psql -U postgres -d painel -Atc 'SELECT count(*) FROM exemplo')"
[[ "$linhas" == "42" ]] || falhar "esperava 42 linhas depois de recriar, veio '$linhas'"
echo "   ok"

echo "== backup.sh num repositório restic local"
export RESTIC_REPOSITORY="$TMP/restic" RESTIC_PASSWORD="senha-de-teste" HC_PING_URL=""
export BACKUP_ENV="$TMP/sem-arquivo.env"
restic init --quiet >/dev/null
bash "$TMP/banco/backup/backup.sh"
[[ "$(restic snapshots --json | grep -o '"short_id"' | wc -l)" -eq 1 ]] ||
  falhar "deveria haver 1 snapshot"
restic ls latest | grep -q 'painel.dump' || falhar "snapshot sem painel.dump"
restic ls latest | grep -q 'globals.sql' || falhar "snapshot sem globals.sql"

echo "== restaurar.sh"
bash "$TMP/banco/backup/restaurar.sh" | tee "$TMP/restauracao.log"
grep -q "contagens iguais em todos os bancos" "$TMP/restauracao.log" || falhar "restauração sem contagens iguais"
dc exec -T postgres psql -U postgres -d postgres -Atc \
  "SELECT count(*) FROM pg_database WHERE datname = 'restauracao_teste'" | grep -qx 0 ||
  falhar "restauracao_teste deveria ter sido apagado"

echo "== Retenção: 7 diárias e 4 semanais"
# 30 snapshots antigos, um por dia, em caminhos diferentes (como os temporários do backup.sh).
for dias in $(seq 1 30); do
  mkdir -p "$TMP/antigo-$dias"
  echo "$dias" >"$TMP/antigo-$dias/dado"
  restic backup --quiet --host asttra-banco --tag banco \
    --time "$(date -u -d "@$(($(date +%s) - dias * 86400))" '+%Y-%m-%d %H:%M:%S')" \
    "$TMP/antigo-$dias" >/dev/null
done
bash "$TMP/banco/backup/backup.sh" >/dev/null
total="$(restic snapshots --json | grep -o '"short_id"' | wc -l)"
# 7 dias seguidos + até 4 semanas (algumas coincidem com os dias): entre 7 e 11.
[[ "$total" -ge 7 && "$total" -le 11 ]] || falhar "retenção deixou $total snapshots (esperado 7 a 11)"
echo "   ok ($total snapshots)"

echo "== Falha: backup com o PostgreSQL parado"
dc stop postgres >/dev/null
antes="$(find /tmp -maxdepth 1 -name 'asttra-backup.*' | wc -l)"
if bash "$TMP/banco/backup/backup.sh" >/dev/null 2>&1; then
  falhar "backup.sh deveria falhar com o PostgreSQL parado"
fi
depois="$(find /tmp -maxdepth 1 -name 'asttra-backup.*' | wc -l)"
[[ "$antes" -eq "$depois" ]] || falhar "backup.sh deixou dumps temporários"
echo "   ok"

echo "Teste de integração do banco: tudo certo."

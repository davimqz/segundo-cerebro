#!/usr/bin/env bash
# Teste de integração de infra/banco: sobe o compose com senhas de teste, confere o isolamento
# dos bancos e a senha do Redis, roda backup.sh num repositório restic local (sem R2 e sem
# Healthchecks.io), com uma pasta de dados do Paperclip de teste (master.key falsa), roda
# restaurar.sh e confere que uma falha termina com erro e limpa os dumps.
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
# Pasta de dados do Paperclip de teste, com uma master.key falsa.
export PAPERCLIP_DADOS="$TMP/paperclip-dados"
mkdir -p "$PAPERCLIP_DADOS/instances/default/secrets"
head -c 32 /dev/urandom >"$PAPERCLIP_DADOS/instances/default/secrets/master.key"
restic init --quiet >/dev/null
bash "$TMP/banco/backup/backup.sh"
# A saída do restic vai para uma variável antes do grep: com pipefail, um grep -q que fecha o pipe
# cedo faria o pipeline falhar por SIGPIPE.
snapshots() {
  local json
  json="$(restic snapshots --host asttra-banco --tag "$1" --json)"
  grep -o '"short_id"' <<<"$json" | wc -l || true
}
tem_no_snapshot() {
  local lista
  lista="$(restic ls latest --tag "$1")"
  grep -q "$2" <<<"$lista"
}
[[ "$(snapshots banco)" -eq 1 ]] || falhar "deveria haver 1 snapshot com a tag banco"
[[ "$(snapshots paperclip)" -eq 1 ]] || falhar "deveria haver 1 snapshot com a tag paperclip"
tem_no_snapshot banco 'painel.dump' || falhar "snapshot sem painel.dump"
tem_no_snapshot banco 'globals.sql' || falhar "snapshot sem globals.sql"
tem_no_snapshot paperclip '/secrets/master\.key$' || falhar "snapshot paperclip sem a master.key"

echo "== restaurar.sh"
bash "$TMP/banco/backup/restaurar.sh" | tee "$TMP/restauracao.log"
grep -q "contagens iguais em todos os bancos" "$TMP/restauracao.log" || falhar "restauração sem contagens iguais"
grep -q "contém a master.key" "$TMP/restauracao.log" || falhar "restaurar.sh não conferiu a master.key"
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
total="$(snapshots banco)"
# 7 dias seguidos + até 4 semanas (algumas coincidem com os dias): entre 7 e 11.
[[ "$total" -ge 7 && "$total" -le 11 ]] || falhar "retenção deixou $total snapshots (esperado 7 a 11)"
# A retenção de uma tag não apaga a outra: os 2 da pasta do Paperclip (mesmo dia) continuam, porque
# com menos de 7 dias de cópias o restic guarda também a mais antiga ("oldest daily snapshot").
PAPERCLIP_SNAPS="$(snapshots paperclip)"
[[ "$PAPERCLIP_SNAPS" -ge 1 && "$PAPERCLIP_SNAPS" -le 2 ]] ||
  falhar "a retenção deixou $PAPERCLIP_SNAPS snapshots com a tag paperclip (esperado 1 ou 2)"
echo "   ok ($total snapshots do banco)"

echo "== Servidor sem Paperclip: backup segue só com o banco"
PAPERCLIP_DADOS="$TMP/nao-existe" bash "$TMP/banco/backup/backup.sh" >"$TMP/sem-paperclip.log"
grep -q "pasta de dados do Paperclip não existe" "$TMP/sem-paperclip.log" || falhar "backup.sh não avisou que pulou a pasta"
[[ "$(snapshots paperclip)" -eq "$PAPERCLIP_SNAPS" ]] || falhar "backup sem a pasta não deveria criar snapshot paperclip"
# restaurar.sh num repositório que nunca teve a tag paperclip.
REPO_PRINCIPAL="$RESTIC_REPOSITORY"
export RESTIC_REPOSITORY="$TMP/restic-sem-paperclip"
restic init --quiet >/dev/null
PAPERCLIP_DADOS="$TMP/nao-existe" bash "$TMP/banco/backup/backup.sh" >/dev/null
PAPERCLIP_DADOS="$TMP/nao-existe" bash "$TMP/banco/backup/restaurar.sh" >"$TMP/restaura-sem-paperclip.log" ||
  { cat "$TMP/restaura-sem-paperclip.log" >&2; falhar "restaurar.sh sem Paperclip deveria terminar com sucesso"; }
grep -q "Sem Paperclip neste servidor: pulada" "$TMP/restaura-sem-paperclip.log" ||
  falhar "restaurar.sh não avisou que pulou a pasta do Paperclip"
# Com a pasta existindo e nenhum snapshot dela, restaurar.sh deve acusar.
if bash "$TMP/banco/backup/restaurar.sh" >/dev/null 2>&1; then
  falhar "restaurar.sh deveria falhar com a pasta do Paperclip sem snapshot"
fi
export RESTIC_REPOSITORY="$REPO_PRINCIPAL"
echo "   ok"

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

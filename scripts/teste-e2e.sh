#!/usr/bin/env bash
# Teste de ponta a ponta do painel: sobe um PostgreSQL descartável e o painel com o próprio
# infra/painel/compose.yml, confere a implantação (healthy, porta só no 127.0.0.1, cabeçalhos),
# testa o criar-chave-hermes.sh e as rotas /api/v1 (spec 007), cria o usuário com `pnpm usuario criar`
# dentro do container e roda o Playwright.
# A tela Aprovações fala com um Paperclip falso (painel/e2e/paperclip-falso.mjs), num container na
# rede asttra; o bot de aprovações sobe sem Telegram e fica parado.
#
# Precisa de: docker (com compose), as dependências do painel e o Chromium do Playwright
#   (pnpm --dir painel exec playwright install chromium).
# Uso: bash scripts/teste-e2e.sh
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
PORTA="${E2E_PORTA:-18080}"
PG="painel-e2e-pg-$$"
FALSO="painel-e2e-paperclip-$$"
PORTA_FALSO="${E2E_PORTA_PAPERCLIP:-18190}"
export COMPOSE_PROJECT_NAME="painel-e2e"
REDE_CRIADA=0
senha() { head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
SENHA_PG="$(senha)"
SENHA_USUARIO="e2e-$(senha)"
CHAVE_FALSA="pcp_board_e2e_$(senha)"
EMPRESA_FALSA="$(senha | sed -E 's/^(.{8})(.{4}).(.{3}).(.{3})(.{12}).*/\1-\2-4\3-8\4-\5/')"

falhar() {
  echo "FALHOU: $*" >&2
  exit 1
}

dc() { docker compose --project-directory "$TMP/painel" "$@"; }

limpar() {
  local codigo=$?
  if [[ $codigo -ne 0 && -f "$TMP/painel/.env" ]]; then
    echo "--- logs do painel ---" >&2
    dc logs --tail 80 >&2 || true
  fi
  dc down -v --remove-orphans >/dev/null 2>&1 || true
  docker rm -f "$PG" "$FALSO" >/dev/null 2>&1 || true
  if [[ $REDE_CRIADA -eq 1 ]]; then docker network rm asttra >/dev/null 2>&1 || true; fi
  rm -rf "$TMP"
  exit "$codigo"
}
trap limpar EXIT

if ! docker network inspect asttra >/dev/null 2>&1; then
  docker network create asttra >/dev/null
  REDE_CRIADA=1
fi

echo "== PostgreSQL descartável na rede asttra"
docker run -d --name "$PG" --network asttra --network-alias painel-e2e-postgres \
  -e POSTGRES_USER=painel -e POSTGRES_PASSWORD="$SENHA_PG" -e POSTGRES_DB=painel \
  postgres:18.6-trixie >/dev/null
for _ in $(seq 1 60); do
  docker exec "$PG" pg_isready -U painel -d painel -h 127.0.0.1 >/dev/null 2>&1 && break
  sleep 1
done

# No Git Bash do Windows, o docker precisa do caminho no formato C:/...
CODIGO="$RAIZ/painel"
command -v cygpath >/dev/null && CODIGO="$(cygpath -m "$CODIGO")"

echo "== Paperclip falso na rede asttra (porta de controle em 127.0.0.1:$PORTA_FALSO)"
MSYS_NO_PATHCONV=1 docker run -d --name "$FALSO" --network asttra --network-alias painel-e2e-paperclip \
  -e CHAVE="$CHAVE_FALSA" -e EMPRESA="$EMPRESA_FALSA" -v "$CODIGO/e2e:/e2e:ro" \
  -p "127.0.0.1:$PORTA_FALSO:3100" node:26.12.0-trixie-slim node /e2e/paperclip-falso.mjs >/dev/null
for _ in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:$PORTA_FALSO/saude" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORTA_FALSO/saude" >/dev/null || { docker logs "$FALSO" >&2; falhar "o Paperclip falso não subiu"; }

echo "== Painel e bot pelo infra/painel/compose.yml"
cp -r "$RAIZ/infra/painel" "$TMP/painel"
cat >"$TMP/painel/.env" <<EOF
DATABASE_URL=postgres://painel:$SENHA_PG@painel-e2e-postgres:5432/painel
BETTER_AUTH_SECRET=$(senha)$(senha)
BETTER_AUTH_URL=http://localhost:$PORTA
PAINEL_NOME=Painel E2E
SESSAO_DIAS=1
PAINEL_PORTA=$PORTA
TZ=America/Sao_Paulo
PAINEL_SRC=$CODIGO
PAPERCLIP_URL=http://painel-e2e-paperclip:3100
PAPERCLIP_EMPRESA_ID=$EMPRESA_FALSA
PAPERCLIP_CHAVE_BOARD=$CHAVE_FALSA
EOF
dc up -d --build --wait --wait-timeout 300

echo "== Implantação"
[[ "$(dc port painel 3000)" == "127.0.0.1:$PORTA" ]] || falhar "o painel deveria escutar só em 127.0.0.1:$PORTA"
estado="$(docker inspect --format '{{.State.Health.Status}}' "$(dc ps -q painel)")"
[[ "$estado" == "healthy" ]] || falhar "o container deveria estar healthy (está $estado)"
cabecalhos="$(curl -sS -D - -o /dev/null "http://127.0.0.1:$PORTA/entrar")"
for c in "content-security-policy:" "strict-transport-security:" "x-content-type-options: nosniff"; do
  grep -qi "^$c" <<<"$cabecalhos" || falhar "falta o cabeçalho $c"
done
BOT="$(dc ps -q bot-aprovacoes)"
[[ "$(docker inspect --format '{{.State.Status}}' "$BOT")" == "running" ]] || falhar "o bot deveria estar rodando"
[[ "$(docker inspect --format '{{len .HostConfig.PortBindings}} {{.HostConfig.ReadonlyRootfs}} {{.HostConfig.Memory}}' "$BOT")" == "0 true 268435456" ]] ||
  falhar "o bot deveria ter 0 portas, read_only e mem_limit de 256 MB"
docker inspect --format '{{json .HostConfig.SecurityOpt}}' "$BOT" | grep -q 'no-new-privileges:true' ||
  falhar "o bot deveria ter no-new-privileges"
for _ in $(seq 1 20); do
  dc logs bot-aprovacoes 2>&1 | grep -q "não configurado" && break
  sleep 1
done
dc logs bot-aprovacoes 2>&1 | grep -q "não configurado" || falhar "sem Telegram, o bot deveria avisar no log e ficar parado"
if dc logs bot-aprovacoes 2>&1 | grep -q "$CHAVE_FALSA"; then falhar "a chave apareceu no log do bot"; fi
echo "   ok"

echo "== Chave do Hermes e rotas /api/v1 (spec 007)"
mkdir "$TMP/hermes"
printf 'HERMES_DONO=Teste\nPAINEL_API_KEY=pnl_antiga\n' >"$TMP/hermes/.env"
chmod 600 "$TMP/hermes/.env"
status_api() { curl -s -o /dev/null -w '%{http_code}' "${@:2}" "http://127.0.0.1:$PORTA/api/v1/$1"; }
chave_do_env() { sed -n 's/^PAINEL_API_KEY=//p' "$TMP/hermes/.env"; }
HERMES_ENV="$TMP/hermes/.env" bash "$TMP/painel/criar-chave-hermes.sh" >"$TMP/chave-1.log" 2>&1 ||
  { cat "$TMP/chave-1.log" >&2; falhar "criar-chave-hermes.sh (vez 1)"; }
CHAVE_1="$(chave_do_env)"
[[ "$CHAVE_1" =~ ^pnl_[A-Za-z0-9_-]{43}$ ]] || falhar "a chave gravada no .env do Hermes tem formato inesperado"
[[ "$(grep -c '^PAINEL_API_KEY=' "$TMP/hermes/.env")" == "1" ]] || falhar "o .env deveria ter uma só PAINEL_API_KEY"
grep -qx 'PAINEL_API_URL=http://painel:3000' "$TMP/hermes/.env" || falhar "faltou PAINEL_API_URL no .env do Hermes"
grep -qx 'HERMES_DONO=Teste' "$TMP/hermes/.env" || falhar "o script apagou outras linhas do .env do Hermes"
if [[ "$(uname -s)" == Linux ]]; then
  [[ "$(stat -c %a "$TMP/hermes/.env")" == "600" ]] || falhar "o .env do Hermes deveria continuar com permissão 600"
fi
[[ "$(status_api avisos)" == "401" ]] || falhar "/api/v1/avisos sem chave deveria responder 401"
[[ "$(status_api avisos -H "authorization: Bearer $CHAVE_1")" == "200" ]] || falhar "/api/v1/avisos com a chave deveria responder 200"
corpo='{"id":"AST-E2E","titulo":"Tarefa do E2E","departamento":"crescimento"}'
[[ "$(status_api tarefas -H "authorization: Bearer $CHAVE_1" -H 'content-type: application/json' -d "$corpo")" == "201" ]] ||
  falhar "POST /api/v1/tarefas deveria responder 201"
[[ "$(status_api tarefas -H "authorization: Bearer $CHAVE_1" -H 'content-type: application/json' -d "$corpo")" == "200" ]] ||
  falhar "POST /api/v1/tarefas repetido deveria responder 200"
# Rodar de novo troca a chave: a antiga deixa de valer.
HERMES_ENV="$TMP/hermes/.env" bash "$TMP/painel/criar-chave-hermes.sh" >"$TMP/chave-2.log" 2>&1 ||
  { cat "$TMP/chave-2.log" >&2; falhar "criar-chave-hermes.sh (vez 2)"; }
CHAVE_2="$(chave_do_env)"
[[ -n "$CHAVE_2" && "$CHAVE_2" != "$CHAVE_1" ]] || falhar "a 2ª vez deveria gravar uma chave nova"
[[ "$(status_api avisos -H "authorization: Bearer $CHAVE_1")" == "401" ]] || falhar "a chave antiga deveria estar revogada"
[[ "$(status_api avisos -H "authorization: Bearer $CHAVE_2")" == "200" ]] || falhar "a chave nova deveria valer"
grep -q 'revogadas de hermes' "$TMP/chave-2.log" || { cat "$TMP/chave-2.log" >&2; falhar "a 2ª vez deveria revogar a chave antiga"; }
for segredo in "$CHAVE_1" "$CHAVE_2"; do
  if grep -qF "$segredo" "$TMP"/chave-*.log || dc logs painel 2>&1 | grep -qF "$segredo"; then
    falhar "uma chave do Hermes apareceu na tela ou no log do painel"
  fi
done
listagem="$(dc exec -T painel node servidor/dist-scripts/chave.mjs listar)"
[[ "$(grep -c $'\thermes\t' <<<"$listagem")" == "2" ]] || falhar "listar deveria mostrar as 2 chaves do hermes: $listagem"
echo "   ok"

echo "== pnpm usuario criar (dentro do container)"
printf '%s\n%s\n' "$SENHA_USUARIO" "$SENHA_USUARIO" |
  dc exec -T painel pnpm --silent usuario criar --email e2e@exemplo.com --nome "Davi E2E"

echo "== Playwright"
cd "$RAIZ/painel"
E2E_URL="http://localhost:$PORTA" \
  E2E_EMAIL="e2e@exemplo.com" \
  E2E_SENHA="$SENHA_USUARIO" \
  E2E_AVISO="docker compose --project-directory $TMP/painel exec -T painel pnpm --silent aviso criar" \
  E2E_PAPERCLIP="http://127.0.0.1:$PORTA_FALSO" \
  E2E_PAPERCLIP_CHAVE="$CHAVE_FALSA" \
  pnpm --silent test:e2e

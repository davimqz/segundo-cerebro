#!/usr/bin/env bash
# Teste de integração do Paperclip (spec 004). Sobe infra/banco (PostgreSQL 18 descartável) e o
# Paperclip de infra/paperclip na versão fixa (imagem oficial pelo digest, sem as CLIs), e confere:
#   - porta só em 127.0.0.1, usuário sem root, telemetria desligada, migrações e /api/health;
#   - o primeiro admin pelo convite-admin.sh;
#   - configurar.sh duas vezes: 1 empresa, 5 projetos, trava de contratação, orçamento 0, 0 agentes;
#   - teste-aprovacao.sh: pedido pendente, aprovado pela API, status approved e chave revogada;
#   - os dados continuam depois de recriar o container.
# As chaves temporárias são aprovadas pela sessão do admin de teste, como o Davi faria no navegador.
#
# Precisa de: docker (com compose), curl, jq, openssl e as portas 127.0.0.1:5432 e :18100 livres.
# Uso: bash scripts/teste-paperclip.sh
# (No Git Bash do Windows, caminhos do container vão dentro de sh -c: assim o MSYS não os converte.)
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d /tmp/teste-paperclip.XXXXXX)"
export COMPOSE_PROJECT_NAME="paperclip-teste"
REDE_CRIADA=0
URL="http://127.0.0.1:18100"
ORIGEM=(-H "origin: $URL")
COOKIES="$TMP/cookies.txt"
EMPRESA="Empresa de Teste"
PROJETOS="Crescimento,Entrega,Clientes,Administração,Direção"

falhar() {
  echo "FALHOU: $*" >&2
  exit 1
}

dc_banco() { docker compose --project-directory "$TMP/banco" "$@"; }
dc() { docker compose --project-directory "$TMP/paperclip" "$@"; }

limpar() {
  local codigo=$?
  if [[ $codigo -ne 0 && -d "$TMP/paperclip" ]]; then
    echo "--- logs do Paperclip ---" >&2
    dc logs --tail 80 paperclip >&2 || true
  fi
  dc down -v --remove-orphans >/dev/null 2>&1 || true
  dc_banco down -v --remove-orphans >/dev/null 2>&1 || true
  # A pasta de dados é do usuário 1000 do container; apaga por dentro dele.
  if [[ -d "$TMP/paperclip/dados" ]]; then
    MSYS_NO_PATHCONV=1 docker run --rm --entrypoint sh -v "$TMP/paperclip/dados:/paperclip" \
      "asttra-paperclip:$VERSAO" -c 'rm -rf /paperclip/* /paperclip/.[!.]*' >/dev/null 2>&1 || true
  fi
  if [[ $REDE_CRIADA -eq 1 ]]; then
    docker network rm asttra >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP" 2>/dev/null || true
  exit "$codigo"
}
trap limpar EXIT

for cmd in docker curl jq openssl; do
  command -v "$cmd" >/dev/null || falhar "$cmd não encontrado"
done

VERSAO="$(sed -n 's/^PAPERCLIP_VERSAO=//p' "$RAIZ/infra/paperclip/.env.example")"
IMAGEM="$(sed -n 's/^PAPERCLIP_IMAGEM=//p' "$RAIZ/infra/paperclip/.env.example")"
[[ -n "$VERSAO" && -n "$IMAGEM" ]] ||
  falhar "PAPERCLIP_VERSAO ou PAPERCLIP_IMAGEM não encontrada em infra/paperclip/.env.example"
[[ "$IMAGEM" == *"@sha256:"* ]] || falhar "PAPERCLIP_IMAGEM deveria estar fixada pelo digest (@sha256:...)"

echo "== Subindo o PostgreSQL (cópia de infra/banco com senhas de teste)"
senha() { openssl rand -hex 24; }
SENHA_PAPERCLIP="$(senha)"
cp -r "$RAIZ/infra/banco" "$TMP/banco"
cat >"$TMP/banco/.env" <<EOF
POSTGRES_PASSWORD=$(senha)
PAINEL_DB_PASSWORD=$(senha)
N8N_DB_PASSWORD=$(senha)
PAPERCLIP_DB_PASSWORD=$SENHA_PAPERCLIP
REDIS_PASSWORD=$(senha)
EOF
if ! docker network inspect asttra >/dev/null 2>&1; then
  docker network create asttra >/dev/null
  REDE_CRIADA=1
fi
dc_banco up -d --wait --wait-timeout 120 postgres

echo "== Montando a imagem do Paperclip $VERSAO"
cp -r "$RAIZ/infra/paperclip" "$TMP/paperclip"
# O container roda como o usuário 1000. No Linux a pasta precisa aceitar escrita dele; no Docker
# Desktop (Windows) o chmod não existe e a montagem já aceita.
mkdir "$TMP/paperclip/dados"
chmod 777 "$TMP/paperclip/dados" 2>/dev/null || true
cat >"$TMP/paperclip/.env" <<EOF
PAPERCLIP_VERSAO=$VERSAO
PAPERCLIP_IMAGEM=$IMAGEM
DATABASE_URL=postgres://paperclip:$SENHA_PAPERCLIP@postgres:5432/paperclip
BETTER_AUTH_SECRET=$(senha)
PAPERCLIP_AGENT_JWT_SECRET=$(senha)
PAPERCLIP_TOOL_ACTION_SIGNING_SECRET=$(senha)
PAPERCLIP_PUBLIC_URL=$URL
PAPERCLIP_AUTH_PUBLIC_BASE_URL=$URL
PAPERCLIP_ALLOWED_HOSTNAMES=127.0.0.1
# Com URL de loopback, o Paperclip troca a porta pela interna (3100); a origem real vem aqui.
# Em produção a URL é https://agentes... e isso não acontece.
BETTER_AUTH_TRUSTED_ORIGINS=$URL
TRUST_PROXY=1
PAPERCLIP_PORTA=18100
EOF
cat >"$TMP/paperclip/configuracao.env" <<EOF
PAPERCLIP_EMPRESA="$EMPRESA"
PAPERCLIP_PROJETOS="$PROJETOS"
PAPERCLIP_URL=$URL
PAPERCLIP_URL_PUBLICA=$URL
EOF
dc build paperclip

echo "== master.key criada antes da primeira subida (e só uma vez)"
bash "$TMP/paperclip/criar-master-key.sh" | grep -q "master.key criada" || falhar "criar-master-key.sh não criou a chave"
bash "$TMP/paperclip/criar-master-key.sh" | grep -q "já existe" || falhar "criar-master-key.sh deveria manter a chave existente"
echo "   ok"

echo "== Subindo o Paperclip"
dc up -d --wait --wait-timeout 300 paperclip
CHAVE_ANTES="$(dc exec -T paperclip sh -c "sha256sum /paperclip/instances/default/secrets/master.key")"

echo "== Rede, usuário e telemetria"
[[ "$(dc port paperclip 3100)" == "127.0.0.1:18100" ]] || falhar "Paperclip deveria publicar só 127.0.0.1:18100"
portas="$(docker inspect --format '{{len .HostConfig.PortBindings}}' "$(dc ps -q paperclip)")"
[[ "$portas" == "1" ]] || falhar "Paperclip publica $portas portas (esperado 1)"
[[ "$(dc exec -T paperclip id -u)" == "1000" ]] || falhar "Paperclip deveria rodar como o usuário 1000"
for cli in claude codex gemini opencode kimi; do
  if dc exec -T paperclip sh -c "command -v $cli" >/dev/null 2>&1; then
    falhar "a imagem não deveria ter a CLI $cli"
  fi
done
ambiente="$(dc exec -T paperclip env)"
grep -qx 'PAPERCLIP_TELEMETRY_DISABLED=1' <<<"$ambiente" || falhar "telemetria não desligada"
grep -qx 'DO_NOT_TRACK=1' <<<"$ambiente" || falhar "DO_NOT_TRACK não ligado"
if grep -qE '^(SENTRY_DSN|OTEL_EXPORTER_OTLP_ENDPOINT|PAPERCLIP_CLOUD_[A-Z_]*)=.' <<<"$ambiente"; then
  falhar "Sentry, OpenTelemetry ou Cloud Connector configurado"
fi
echo "   ok"

echo "== Banco externo: migrações aplicadas e nada do banco embutido"
saude="$(curl -fsS "$URL/api/health")"
jq -e '.status == "ok"' <<<"$saude" >/dev/null || falhar "/api/health sem status ok: $saude"
tabelas="$(dc_banco exec -T postgres psql -U postgres -d paperclip -Atc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")"
[[ "$tabelas" -gt 20 ]] || falhar "migrações não aplicadas no banco paperclip ($tabelas tabelas)"
dc exec -T paperclip sh -c "test -d /paperclip/instances/default && test ! -e /paperclip/instances/default/db" ||
  falhar "Paperclip criou o banco embutido (ou a pasta de dados não está montada)"
echo "   ok ($tabelas tabelas)"

echo "== Primeiro admin pelo convite"
convite="$(BANCO_DIR="$TMP/banco" CONFIG_ENV="$TMP/paperclip/configuracao.env" \
  bash "$TMP/paperclip/convite-admin.sh" | sed -n 's#.*/invite/\(pcp_bootstrap_[0-9a-f]*\)$#\1#p')"
[[ -n "$convite" ]] || falhar "convite-admin.sh não mostrou o link do convite"
curl -fsS -c "$COOKIES" -b "$COOKIES" "${ORIGEM[@]}" -H "content-type: application/json" \
  --data "{\"email\":\"admin@teste.local\",\"password\":\"$(senha)\",\"name\":\"Admin de Teste\"}" \
  "$URL/api/auth/sign-up/email" >/dev/null || falhar "cadastro do admin de teste"
curl -fsS -c "$COOKIES" -b "$COOKIES" "${ORIGEM[@]}" -H "content-type: application/json" \
  --data '{"requestType":"human"}' "$URL/api/invites/$convite/accept" >/dev/null ||
  falhar "aceite do convite"
curl -fsS "$URL/api/health" | jq -e '.bootstrapStatus == "ready"' >/dev/null ||
  falhar "o Paperclip deveria ter admin depois do convite"
if BANCO_DIR="$TMP/banco" CONFIG_ENV="$TMP/paperclip/configuracao.env" \
  bash "$TMP/paperclip/convite-admin.sh" >/dev/null 2>&1; then
  falhar "convite-admin.sh deveria recusar quando já há admin"
fi
echo "   ok"

# API como o admin de teste (sessão do navegador).
sessao() {
  local metodo="$1" caminho="$2" corpo="${3:-}"
  local args=(-sS --fail-with-body -b "$COOKIES" "${ORIGEM[@]}" -X "$metodo")
  if [[ -n "$corpo" ]]; then
    printf '%s' "$corpo" | curl "${args[@]}" -H "content-type: application/json" --data-binary @- "$URL/api$caminho"
  else
    curl "${args[@]}" "$URL/api$caminho"
  fi
}

# Roda um script de infra/paperclip em segundo plano e aprova o pedido de chave dele pela sessão.
# Uso: rodar_aprovando LOG script.sh
rodar_aprovando() {
  local log="$1" script="$2" caminho id token
  CONFIG_ENV="$TMP/paperclip/configuracao.env" bash "$TMP/paperclip/$script" >"$log" 2>&1 &
  PID_SCRIPT=$!
  for _ in $(seq 1 60); do
    caminho="$(sed -n 's#^  http[^ ]*\(/cli-auth/[^ ]*\)$#\1#p' "$log")"
    [[ -n "$caminho" ]] && break
    sleep 1
  done
  [[ -n "$caminho" ]] || { cat "$log" >&2; falhar "$script não mostrou o link de aprovação"; }
  id="${caminho#/cli-auth/}"
  id="${id%%\?*}"
  token="${caminho#*\?token=}"
  sessao POST "/cli-auth/challenges/$id/approve" "$(jq -nc --arg t "$token" '{token: $t}')" >/dev/null ||
    falhar "aprovação do pedido de chave de $script"
}

echo "== configurar.sh duas vezes"
for vez in 1 2; do
  rodar_aprovando "$TMP/configurar-$vez.log" configurar.sh
  wait "$PID_SCRIPT" || { cat "$TMP/configurar-$vez.log" >&2; falhar "configurar.sh (vez $vez)"; }
  grep -q "Chave temporária revogada" "$TMP/configurar-$vez.log" || falhar "configurar.sh não revogou a chave"
done
grep -q "já existe: $EMPRESA" "$TMP/configurar-2.log" || falhar "a 2ª vez deveria achar a empresa existente"
empresas="$(sessao GET /companies | jq --arg n "$EMPRESA" '[.[] | select(.name == $n)] | length')"
[[ "$empresas" == "1" ]] || falhar "esperava 1 empresa, veio $empresas"
EMPRESA_ID="$(sessao GET /companies | jq -r --arg n "$EMPRESA" '.[] | select(.name == $n) | .id')"
projetos="$(sessao GET "/companies/$EMPRESA_ID/projects" | jq -c '[.[].name] | sort')"
esperado="$(jq -cn --arg p "$PROJETOS" '$p | split(",") | sort')"
[[ "$projetos" == "$esperado" ]] || falhar "projetos $projetos (esperado $esperado)"
empresa="$(sessao GET "/companies/$EMPRESA_ID")"
jq -e '.requireBoardApprovalForNewAgents == true and .budgetMonthlyCents == 0' <<<"$empresa" >/dev/null ||
  falhar "trava de contratação ou orçamento errados"
jq -e '.description | contains("request_board_approval")' <<<"$empresa" >/dev/null ||
  falhar "a descrição da empresa não tem a regra escrita"
agentes="$(sessao GET "/companies/$EMPRESA_ID/agents" | jq 'length')"
[[ "$agentes" == "0" ]] || falhar "nenhum agente deveria existir, há $agentes"
echo "   ok (1 empresa, 5 projetos, 0 agentes)"

echo "== teste-aprovacao.sh: pedido pendente e aprovado"
export TEMPO_LIMITE=120
rodar_aprovando "$TMP/aprovacao.log" teste-aprovacao.sh
pedido=""
for _ in $(seq 1 30); do
  pedido="$(sed -n 's/^Pedido criado: //p' "$TMP/aprovacao.log")"
  [[ -n "$pedido" ]] && break
  sleep 1
done
[[ -n "$pedido" ]] || { cat "$TMP/aprovacao.log" >&2; falhar "teste-aprovacao.sh não criou o pedido"; }
sessao GET "/companies/$EMPRESA_ID/approvals?status=pending" |
  jq -e --arg id "$pedido" 'any(.[]; .id == $id and .type == "request_board_approval")' >/dev/null ||
  falhar "o pedido não está na fila de pendentes"
sessao POST "/approvals/$pedido/approve" '{"decisionNote":"Aprovado pelo teste de integração."}' >/dev/null ||
  falhar "aprovação do pedido"
wait "$PID_SCRIPT" || { cat "$TMP/aprovacao.log" >&2; falhar "teste-aprovacao.sh deveria terminar com sucesso"; }
grep -q "Status do pedido: approved" "$TMP/aprovacao.log" || falhar "teste-aprovacao.sh não imprimiu approved"
grep -q "Chave temporária revogada" "$TMP/aprovacao.log" || falhar "teste-aprovacao.sh não revogou a chave"
ativas="$(sessao GET /board-api-keys | jq 'length')"
[[ "$ativas" == "0" ]] || falhar "deveria haver 0 chaves de board ativas, há $ativas"
if grep -rq 'pcp_board_' "$TMP"/*.log; then
  falhar "uma chave de board apareceu nos logs dos scripts"
fi
echo "   ok"

echo "== Dados continuam depois de recriar o container"
dc up -d --force-recreate --wait --wait-timeout 300 paperclip >/dev/null 2>&1
[[ "$(sessao GET "/companies/$EMPRESA_ID/projects" | jq 'length')" == "5" ]] ||
  falhar "projetos perdidos depois de recriar"
[[ "$(sessao GET "/approvals/$pedido" | jq -r .status)" == "approved" ]] ||
  falhar "pedido aprovado perdido depois de recriar"
[[ "$(dc exec -T paperclip sh -c "sha256sum /paperclip/instances/default/secrets/master.key")" == "$CHAVE_ANTES" ]] ||
  falhar "a master.key mudou ou sumiu depois de recriar"
# O Paperclip aceita a chave criada: grava e lê um segredo com ela.
sessao POST "/companies/$EMPRESA_ID/secrets" '{"name":"TESTE_CHAVE","value":"valor-de-teste"}' >/dev/null ||
  falhar "o Paperclip não conseguiu gravar um segredo com a master.key"
echo "   ok"

echo "Teste de integração do Paperclip: tudo certo."

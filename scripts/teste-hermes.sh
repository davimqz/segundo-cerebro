#!/usr/bin/env bash
# Teste de integração do Hermes (spec 005, ADR 0007). Sobe infra/banco (PostgreSQL 18 descartável),
# o Paperclip de infra/paperclip e o Hermes de infra/hermes (imagem oficial pelo digest), sem
# Telegram e sem OpenRouter de verdade, e confere:
#   - Hermes sem portas publicadas, sem o socket do Docker, rodando como o usuário hermes;
#   - a API do Hermes na rede "asttra": /health público e 401 sem a chave;
#   - configurar.sh duas vezes: contratação aprovada, 1 agente hermes_gateway, sem heartbeat,
#     1 chave de agente gravada no .env (sem aparecer no log);
#   - ferramentas ativas no Telegram e na API sem terminal, código, arquivos, navegador nem web;
#   - o MCP do Paperclip, de dentro do container, cria a tarefa no projeto certo;
#   - a memória (pasta de dados) continua depois de recriar o container.
#
# Precisa de: docker (com compose), curl, jq, openssl e as portas 127.0.0.1:5432 e :18100 livres.
# Uso: bash scripts/teste-hermes.sh
# (No Git Bash do Windows, caminhos do container vão dentro de sh -c: assim o MSYS não os converte.)
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d /tmp/teste-hermes.XXXXXX)"
export COMPOSE_PROJECT_NAME="hermes-teste"
REDE_CRIADA=0
URL="http://127.0.0.1:18100"
ORIGEM=(-H "origin: $URL")
COOKIES="$TMP/cookies.txt"
EMPRESA="Empresa de Teste"
PROJETOS="Crescimento,Entrega,Clientes,Administração,Direção"
PROIBIDAS="terminal file code_execution browser computer_use web delegation cronjob image_gen kanban"

falhar() {
  echo "FALHOU: $*" >&2
  exit 1
}

dc_banco() { docker compose --project-directory "$TMP/banco" "$@"; }
dc_pc() { docker compose --project-directory "$TMP/paperclip" "$@"; }
dc() { docker compose --project-directory "$TMP/hermes" "$@"; }

limpar() {
  local codigo=$?
  if [[ $codigo -ne 0 && -d "$TMP/hermes" ]]; then
    echo "--- logs do Hermes ---" >&2
    dc logs --tail 60 hermes >&2 || true
    echo "--- logs do Paperclip ---" >&2
    dc_pc logs --tail 40 paperclip >&2 || true
  fi
  dc down -v --remove-orphans >/dev/null 2>&1 || true
  dc_pc down -v --remove-orphans >/dev/null 2>&1 || true
  dc_banco down -v --remove-orphans >/dev/null 2>&1 || true
  # As pastas de dados são de usuários dos containers; apaga por dentro deles.
  if [[ -d "$TMP/hermes/dados" ]]; then
    MSYS_NO_PATHCONV=1 docker run --rm --entrypoint sh -v "$TMP/hermes/dados:/opt/data" \
      "$HERMES_IMAGEM" -c 'rm -rf /opt/data/* /opt/data/.[!.]*' >/dev/null 2>&1 || true
  fi
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
IMAGEM_PC="$(sed -n 's/^PAPERCLIP_IMAGEM=//p' "$RAIZ/infra/paperclip/.env.example")"
HERMES_IMAGEM="$(sed -n 's/^HERMES_IMAGEM=//p' "$RAIZ/infra/hermes/.env.example")"
[[ "$HERMES_IMAGEM" == *"@sha256:"* ]] || falhar "HERMES_IMAGEM deveria estar fixada pelo digest (@sha256:...)"
senha() { openssl rand -hex 24; }

echo "== Subindo o PostgreSQL e o Paperclip (cópias de infra/ com senhas de teste)"
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

cp -r "$RAIZ/infra/paperclip" "$TMP/paperclip"
mkdir "$TMP/paperclip/dados"
chmod 777 "$TMP/paperclip/dados" 2>/dev/null || true
cat >"$TMP/paperclip/.env" <<EOF
PAPERCLIP_VERSAO=$VERSAO
PAPERCLIP_IMAGEM=$IMAGEM_PC
DATABASE_URL=postgres://paperclip:$SENHA_PAPERCLIP@postgres:5432/paperclip
BETTER_AUTH_SECRET=$(senha)
PAPERCLIP_AGENT_JWT_SECRET=$(senha)
PAPERCLIP_TOOL_ACTION_SIGNING_SECRET=$(senha)
PAPERCLIP_PUBLIC_URL=$URL
PAPERCLIP_AUTH_PUBLIC_BASE_URL=$URL
PAPERCLIP_ALLOWED_HOSTNAMES=127.0.0.1,paperclip
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
# A imagem local do Paperclip é reaproveitada se já existir (montá-la baixa ~2,5 GB).
docker image inspect "asttra-paperclip:$VERSAO" >/dev/null 2>&1 || dc_pc build paperclip
bash "$TMP/paperclip/criar-master-key.sh" >/dev/null
dc_pc up -d --wait --wait-timeout 300 paperclip

echo "== Admin de teste e empresa"
convite="$(BANCO_DIR="$TMP/banco" CONFIG_ENV="$TMP/paperclip/configuracao.env" \
  bash "$TMP/paperclip/convite-admin.sh" | sed -n 's#.*/invite/\(pcp_bootstrap_[0-9a-f]*\)$#\1#p')"
[[ -n "$convite" ]] || falhar "convite-admin.sh não mostrou o link do convite"
curl -fsS -c "$COOKIES" -b "$COOKIES" "${ORIGEM[@]}" -H "content-type: application/json" \
  --data "{\"email\":\"admin@teste.local\",\"password\":\"$(senha)\",\"name\":\"Admin de Teste\"}" \
  "$URL/api/auth/sign-up/email" >/dev/null || falhar "cadastro do admin de teste"
curl -fsS -c "$COOKIES" -b "$COOKIES" "${ORIGEM[@]}" -H "content-type: application/json" \
  --data '{"requestType":"human"}' "$URL/api/invites/$convite/accept" >/dev/null || falhar "aceite do convite"

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

# Roda um script em segundo plano e aprova o pedido de chave de board dele pela sessão.
# Uso: rodar_aprovando LOG comando...
rodar_aprovando() {
  local log="$1" caminho id token
  shift
  "$@" >"$log" 2>&1 &
  PID_SCRIPT=$!
  caminho=""
  for _ in $(seq 1 60); do
    caminho="$(sed -n 's#^  http[^ ]*\(/cli-auth/[^ ]*\)$#\1#p' "$log")"
    [[ -n "$caminho" ]] && break
    sleep 1
  done
  [[ -n "$caminho" ]] || { cat "$log" >&2; falhar "$* não mostrou o link de aprovação"; }
  id="${caminho#/cli-auth/}"
  id="${id%%\?*}"
  token="${caminho#*\?token=}"
  sessao POST "/cli-auth/challenges/$id/approve" "$(jq -nc --arg t "$token" '{token: $t}')" >/dev/null ||
    falhar "aprovação do pedido de chave de $*"
}

rodar_aprovando "$TMP/configurar-paperclip.log" env CONFIG_ENV="$TMP/paperclip/configuracao.env" \
  bash "$TMP/paperclip/configurar.sh"
wait "$PID_SCRIPT" || { cat "$TMP/configurar-paperclip.log" >&2; falhar "configurar.sh do Paperclip"; }
EMPRESA_ID="$(sessao GET /companies | jq -r --arg n "$EMPRESA" '.[] | select(.name == $n) | .id')"
echo "   ok"

echo "== configurar.sh do Hermes duas vezes"
cp -r "$RAIZ/infra/hermes" "$TMP/hermes"
API_KEY_HERMES="$(openssl rand -hex 32)"
cat >"$TMP/hermes/.env" <<EOF
HERMES_IMAGEM=$HERMES_IMAGEM
HERMES_MODELO=teste/modelo-inexistente:free
HERMES_DONO=Dono de Teste
OPENROUTER_API_KEY=sk-or-chave-de-teste
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USERS=
API_SERVER_KEY=$API_KEY_HERMES
PAPERCLIP_API_URL=http://paperclip:3100
PAPERCLIP_URL_PUBLICA=$URL
PAPERCLIP_API_KEY=
EOF
configurar_hermes() {
  rodar_aprovando "$1" env CONFIG_ENV="$TMP/paperclip/configuracao.env" PAPERCLIP_DIR="$TMP/paperclip" \
    bash "$TMP/hermes/configurar.sh"
}

configurar_hermes "$TMP/configurar-hermes-1.log"
# A trava de contratação gera um pedido hire_agent; o admin aprova, como o Davi faria na tela.
pedido=""
for _ in $(seq 1 60); do
  pedido="$(sessao GET "/companies/$EMPRESA_ID/approvals?status=pending" |
    jq -r '[.[] | select(.type == "hire_agent")][0].id // empty')"
  [[ -n "$pedido" ]] && break
  sleep 1
done
[[ -n "$pedido" ]] || { cat "$TMP/configurar-hermes-1.log" >&2; falhar "a contratação não gerou pedido hire_agent"; }
sessao POST "/approvals/$pedido/approve" '{"decisionNote":"Aprovado pelo teste de integração."}' >/dev/null ||
  falhar "aprovação da contratação"
wait "$PID_SCRIPT" || { cat "$TMP/configurar-hermes-1.log" >&2; falhar "configurar.sh do Hermes (vez 1)"; }
grep -q "Aprove a contratação" "$TMP/configurar-hermes-1.log" || falhar "configurar.sh não pediu a aprovação"

configurar_hermes "$TMP/configurar-hermes-2.log"
wait "$PID_SCRIPT" || { cat "$TMP/configurar-hermes-2.log" >&2; falhar "configurar.sh do Hermes (vez 2)"; }
grep -q "já existe; configuração conferida" "$TMP/configurar-hermes-2.log" || falhar "a 2ª vez deveria achar o agente"
grep -q "a chave do .env continua valendo" "$TMP/configurar-hermes-2.log" || falhar "a 2ª vez deveria manter a chave"
for log in "$TMP"/configurar-hermes-*.log; do
  grep -q "Chave temporária revogada" "$log" || falhar "configurar.sh do Hermes não revogou a chave de board"
done

agentes="$(sessao GET "/companies/$EMPRESA_ID/agents" | jq -c '[.[] | select(.name == "Hermes")]')"
[[ "$(jq length <<<"$agentes")" == "1" ]] || falhar "esperava 1 agente Hermes: $agentes"
AGENTE_ID="$(jq -r '.[0].id' <<<"$agentes")"
agente="$(sessao GET "/agents/$AGENTE_ID")"
jq -e '.adapterType == "hermes_gateway" and .adapterConfig.apiBaseUrl == "http://hermes:8642"' <<<"$agente" \
  >/dev/null || falhar "adaptador errado: $(jq -c '{adapterType, adapterConfig}' <<<"$agente")"
jq -e '.adapterConfig.apiKey.type == "secret_ref"' <<<"$agente" >/dev/null ||
  falhar "a chave da API do Hermes deveria ser um segredo do Paperclip"
jq -e '.runtimeConfig.heartbeat.enabled == false' <<<"$agente" >/dev/null || falhar "heartbeat agendado ligado"
[[ "$(jq -r .status <<<"$agente")" != "pending_approval" ]] || falhar "agente ainda pendente"
chaves="$(sessao GET "/agents/$AGENTE_ID/keys" | jq '[.[] | select((.revokedAt // null) == null)] | length')"
[[ "$chaves" == "1" ]] || falhar "esperava 1 chave de agente ativa, há $chaves"
CHAVE_AGENTE="$(sed -n 's/^PAPERCLIP_API_KEY=//p' "$TMP/hermes/.env")"
[[ -n "$CHAVE_AGENTE" ]] || falhar "a chave de agente não foi gravada no .env do Hermes"
if grep -rqF "$CHAVE_AGENTE" "$TMP"/*.log; then
  falhar "a chave de agente apareceu no log do configurar.sh"
fi
if grep -rq 'pcp_board_' "$TMP"/*.log; then
  falhar "uma chave de board apareceu nos logs"
fi
if [[ "$(uname -s)" == Linux ]]; then
  [[ "$(stat -c %a "$TMP/hermes/.env")" == "600" ]] || falhar "o .env do Hermes deveria ter permissão 600"
fi
[[ -f "$TMP/hermes/dados/config.yaml" && -f "$TMP/hermes/dados/SOUL.md" ]] || falhar "config.yaml ou SOUL.md não copiados"
[[ ! -s "$TMP/hermes/dados/.env" ]] || falhar "dados/.env deveria existir vazio"
grep -q "request_board_approval" "$TMP/hermes/dados/SOUL.md" || falhar "o SOUL.md não tem a regra de aprovação"
grep -q "Dono de Teste" "$TMP/hermes/dados/SOUL.md" || falhar "o SOUL.md não tem o nome do dono"
if grep -q '{{' "$TMP/hermes/dados/SOUL.md"; then
  falhar "o SOUL.md ficou com marcadores sem trocar"
fi
echo "   ok (1 agente hermes_gateway sem heartbeat, 1 chave, contratação aprovada)"

echo "== Subindo o Hermes"
dc up -d --wait --wait-timeout 240 hermes
CONTAINER="$(dc ps -q hermes)"

echo "== Rede, socket do Docker e usuário"
portas="$(docker inspect --format '{{len .HostConfig.PortBindings}}' "$CONTAINER")"
[[ "$portas" == "0" ]] || falhar "o Hermes não deveria publicar portas ($portas)"
if docker inspect --format '{{range .Mounts}}{{println .Source .Destination}}{{end}}' "$CONTAINER" | grep -q docker.sock; then
  falhar "o socket do Docker não deveria estar montado no Hermes"
fi
redes="$(docker inspect --format '{{range $k, $v := .NetworkSettings.Networks}}{{println $k}}{{end}}' "$CONTAINER" | sed '/^$/d')"
[[ "$redes" == "asttra" ]] || falhar "o Hermes deveria estar só na rede asttra (está em: $redes)"
docker inspect --format '{{json .HostConfig.SecurityOpt}}' "$CONTAINER" | grep -q 'no-new-privileges:true' ||
  falhar "falta no-new-privileges"
# O gateway (python) deve rodar como o usuário hermes (UID 10000), nunca como root.
usuario_gateway="$(docker top "$CONTAINER" -o pid,user,args | awk '/python/ && /hermes/ {print $2; exit}')"
[[ "$usuario_gateway" == "10000" || "$usuario_gateway" == "hermes" ]] ||
  falhar "o gateway do Hermes deveria rodar como hermes (está como: ${usuario_gateway:-?})"
echo "   ok"

echo "== API do Hermes vista da rede asttra"
# Chamada de dentro do container do Paperclip, que é quem usa a API (hermes_gateway).
status_api() {
  local metodo="$1" caminho="$2" chave="${3:-}"
  # MSYS_NO_PATHCONV: no Git Bash do Windows, o "/health" viraria um caminho do Windows.
  MSYS_NO_PATHCONV=1 dc_pc exec -T -e M="$metodo" -e P="$caminho" -e K="$chave" paperclip node -e '
    const h = process.env.K ? {authorization: "Bearer " + process.env.K} : {};
    if (process.env.M === "POST") h["content-type"] = "application/json";
    fetch("http://hermes:8642" + process.env.P, {method: process.env.M, headers: h,
      body: process.env.M === "POST" ? "{}" : undefined})
      .then(r => console.log(r.status)).catch(e => console.log("erro: " + (e.cause?.code || e.message)))' 2>&1 |
    tr -d '\r'
}
confere_api() {
  local esperado="$1" recebido
  shift
  recebido="$(status_api "$@")"
  [[ "$recebido" == "$esperado" ]] || falhar "$1 $2 deveria responder $esperado (veio: $recebido)"
}
confere_api 200 GET /health
confere_api 401 POST /v1/runs
confere_api 401 GET /v1/models
confere_api 200 GET /v1/models "$API_KEY_HERMES"
echo "   ok"

echo "== Ferramentas ativas sem terminal, código, arquivos, navegador nem web"
for plataforma in telegram api_server; do
  lista="$(dc exec -T -u hermes hermes hermes tools list --platform "$plataforma" 2>&1)"
  for ferramenta in $PROIBIDAS; do
    if grep -Eq "✓ enabled +$ferramenta( |$)" <<<"$lista"; then
      echo "$lista" >&2
      falhar "a ferramenta $ferramenta está ligada em $plataforma"
    fi
  done
  grep -Eq "✓ enabled +memory( |$)" <<<"$lista" || { echo "$lista" >&2; falhar "memory deveria estar ligada em $plataforma"; }
  grep -Eq "^ +paperclip +all tools enabled" <<<"$lista" || { echo "$lista" >&2; falhar "o MCP paperclip deveria estar ligado em $plataforma"; }
done
echo "   ok"

echo "== MCP do Paperclip cria a tarefa no projeto certo"
mcp() {
  # Uma sessão MCP por stdio, com as mesmas variáveis que o Hermes passa ao servidor.
  dc exec -T hermes sh -c 'python3 /opt/asttra/mcp-paperclip/servidor.py'
}
entrada="$(jq -nc '{jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-06-18"}}')
$(jq -nc '{jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"listar_departamentos",arguments:{}}}')
$(jq -nc '{jsonrpc:"2.0",id:3,method:"tools/call",params:{name:"criar_tarefa",arguments:{departamento:"crescimento",titulo:"Tarefa do teste do Hermes",descricao:"Criada pelo scripts/teste-hermes.sh."}}}')
$(jq -nc '{jsonrpc:"2.0",id:4,method:"tools/call",params:{name:"criar_tarefa",arguments:{departamento:"Vendas",titulo:"Não deve existir",descricao:"Departamento inválido."}}}')"
saida="$(printf '%s\n' "$entrada" | mcp)"
resposta() { jq -c --argjson i "$1" 'select(.id == $i) | .result' <<<"$saida"; }
resposta 2 | jq -e '.isError == false and (.content[0].text | fromjson | index("Administração") != null)' >/dev/null ||
  falhar "listar_departamentos: $(resposta 2)"
resposta 3 | jq -e '.isError == false' >/dev/null || falhar "criar_tarefa: $(resposta 3)"
tarefa="$(resposta 3 | jq -r '.content[0].text')"
IDENT="$(jq -r .id <<<"$tarefa")"
[[ "$(jq -r .link <<<"$tarefa")" == "$URL/issues/$IDENT" ]] || falhar "link errado: $tarefa"
resposta 4 | jq -e '.isError == true' >/dev/null || falhar "criar_tarefa com departamento inválido deveria falhar"
criada="$(sessao GET "/issues/$IDENT")"
PROJETO_CRESCIMENTO="$(sessao GET "/companies/$EMPRESA_ID/projects" | jq -r '.[] | select(.name == "Crescimento") | .id')"
jq -e --arg p "$PROJETO_CRESCIMENTO" '.projectId == $p and .title == "Tarefa do teste do Hermes"' <<<"$criada" \
  >/dev/null || falhar "a tarefa não ficou no projeto Crescimento: $(jq -c '{projectId, title}' <<<"$criada")"
total="$(sessao GET "/companies/$EMPRESA_ID/issues" | jq '[.[] | select(.title == "Não deve existir")] | length')"
[[ "$total" == "0" ]] || falhar "a tarefa com departamento inválido foi criada"
echo "   ok ($IDENT em Crescimento)"

echo "== Nenhum segredo na pasta de dados (ela vai para o backup)"
for segredo in "$API_KEY_HERMES" "$CHAVE_AGENTE" "sk-or-chave-de-teste"; do
  # O $S é expandido dentro do container, onde o segredo chega pela variável de ambiente.
  # shellcheck disable=SC2016
  if dc exec -T -e S="$segredo" hermes sh -c 'grep -rlF -- "$S" /opt/data 2>/dev/null' | grep -q .; then
    falhar "um segredo do .env foi gravado na pasta de dados do Hermes"
  fi
done
echo "   ok"

echo "== Dados continuam depois de recriar o container"
dc exec -T hermes sh -c 'echo "marca-do-teste" > /opt/data/memories/teste-hermes.txt'
dc up -d --force-recreate --wait --wait-timeout 240 hermes >/dev/null 2>&1
dc exec -T hermes sh -c 'cat /opt/data/memories/teste-hermes.txt' | grep -q "marca-do-teste" ||
  falhar "a pasta de dados não sobreviveu à recriação"
echo "   ok"

echo "Teste de integração do Hermes: tudo certo."

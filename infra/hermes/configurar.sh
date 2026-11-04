#!/usr/bin/env bash
# Liga o Hermes ao Paperclip (spec 005, ADR 0007). Idempotente: rodar de novo não duplica nada.
#   - guarda a API_SERVER_KEY do Hermes como segredo do Paperclip (hermes-api-key);
#   - contrata o agente HERMES_NOME com o adaptador hermes_gateway (http://hermes:8642), sem
#     heartbeat agendado. A trava de contratação gera um pedido que o Davi aprova no Paperclip;
#   - cria a chave de agente do Hermes e a grava direto no .env do Hermes (chmod 600), sem mostrar;
#   - copia config.yaml e SOUL.md (com a regra de aprovação) para dados/ e cria dados/.env vazio.
#
# Uso (no servidor): sudo /opt/asttra/hermes/configurar.sh
# Variáveis: o .env do Hermes ao lado (HERMES_ENV muda o arquivo) e o configuracao.env do Paperclip
# (PAPERCLIP_DIR aponta a pasta do Paperclip; padrão ../paperclip). PAPERCLIP_CHAVE opcional (lib.sh).
# HERMES_TROCAR_CHAVE_API=1 grava uma nova versão do segredo, depois de trocar a API_SERVER_KEY.
set -euo pipefail

HERMES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAPERCLIP_DIR="${PAPERCLIP_DIR:-$HERMES_DIR/../paperclip}"
HERMES_ENV="${HERMES_ENV:-$HERMES_DIR/.env}"
HERMES_DADOS="${HERMES_DADOS:-$HERMES_DIR/dados}"
HERMES_NOME="${HERMES_NOME:-Hermes}"
HERMES_URL_INTERNA="${HERMES_URL_INTERNA:-http://hermes:8642}"
SEGREDO_CHAVE="hermes-api-key"

# shellcheck source=/dev/null
source "$PAPERCLIP_DIR/lib.sh"
pc_carregar_config
: "${PAPERCLIP_EMPRESA:?defina PAPERCLIP_EMPRESA no configuracao.env do Paperclip}"

[[ -f "$HERMES_ENV" ]] || pc_falhar "não encontrei $HERMES_ENV (copie o .env.example e preencha)"
# Lê uma variável do .env do Hermes sem executar o arquivo.
# Valores sem aspas (como no .env.example); o \r de um arquivo salvo no Windows é ignorado.
env_hermes() { sed -n "s/^$1=//p" "$HERMES_ENV" | tail -n 1 | tr -d '\r'; }
API_KEY_HERMES="$(env_hermes API_SERVER_KEY)"
((${#API_KEY_HERMES} >= 16)) || pc_falhar "API_SERVER_KEY vazia ou curta no .env do Hermes (gere com: openssl rand -hex 32)"
DONO="$(env_hermes HERMES_DONO)"
[[ -n "$DONO" ]] || pc_falhar "defina HERMES_DONO no .env do Hermes (quem fala com o Hermes)"
# Regra de custo: só modelo gratuito do OpenRouter.
[[ "$(env_hermes HERMES_MODELO)" == *:free ]] ||
  pc_falhar "HERMES_MODELO vazio ou não gratuito no .env do Hermes (precisa terminar em :free)"
for var in OPENROUTER_API_KEY TELEGRAM_BOT_TOKEN TELEGRAM_ALLOWED_USERS; do
  [[ -n "$(env_hermes "$var")" ]] ||
    echo "AVISO: $var vazia no .env do Hermes; o Hermes não vai responder no Telegram." >&2
done
PAPERCLIP_URL_INTERNA="$(env_hermes PAPERCLIP_API_URL)"
PAPERCLIP_URL_INTERNA="${PAPERCLIP_URL_INTERNA:-http://paperclip:3100}"

REGRA="$(sed -n '/^<!-- regra -->$/,/^<!-- \/regra -->$/{//!p}' "$PAPERCLIP_DIR/regra-de-aprovacao.md")"
[[ -n "$REGRA" ]] || pc_falhar "regra vazia em regra-de-aprovacao.md"

pc_obter_chave hermes-configurar.sh

echo "== Empresa"
EMPRESA_ID="$(pc_id_empresa "$PAPERCLIP_EMPRESA")"
[[ -n "$EMPRESA_ID" ]] || pc_falhar "a empresa '$PAPERCLIP_EMPRESA' não existe (rode antes o configurar.sh do Paperclip)"
echo "   $PAPERCLIP_EMPRESA"

echo "== Segredo com a chave da API do Hermes"
SEGREDO_ID="$(pc_api GET "/companies/$EMPRESA_ID/secrets" |
  jq -r --arg k "$SEGREDO_CHAVE" '[.[] | select(.key == $k or .name == $k)][0].id // empty')"
if [[ -z "$SEGREDO_ID" ]]; then
  # A chave vai ao jq pelo ambiente ($ENV.V), não por argumento: assim não aparece no ps.
  SEGREDO_ID="$(pc_api POST "/companies/$EMPRESA_ID/secrets" "$(V="$API_KEY_HERMES" jq -nc --arg k "$SEGREDO_CHAVE" \
    '{name: $k, key: $k, value: $ENV.V, description: "API_SERVER_KEY do Hermes (spec 005)"}')" |
    jq -r .id)"
  echo "   criado"
elif [[ "${HERMES_TROCAR_CHAVE_API:-0}" == "1" ]]; then
  pc_api POST "/secrets/$SEGREDO_ID/rotate" "$(V="$API_KEY_HERMES" jq -nc '{value: $ENV.V}')" >/dev/null
  echo "   nova versão gravada"
else
  echo "   já existe; a chave não foi comparada. Se você trocou a API_SERVER_KEY, rode com HERMES_TROCAR_CHAVE_API=1"
fi
[[ -n "$SEGREDO_ID" && "$SEGREDO_ID" != "null" ]] || pc_falhar "não consegui criar o segredo"

# Configuração desejada do agente. Sem heartbeat agendado: o Hermes só acorda com uma tarefa.
# HTTP sem TLS é aceito porque o tráfego não sai da rede interna "asttra" (ADR 0007).
ADAPTADOR="$(jq -nc --arg url "$HERMES_URL_INTERNA" --arg seg "$SEGREDO_ID" --arg pc "$PAPERCLIP_URL_INTERNA" '{
  apiBaseUrl: $url,
  apiKey: {type: "secret_ref", secretId: $seg, version: "latest"},
  dangerouslyAllowInsecureRemoteHttp: true,
  paperclipApiUrl: $pc,
  sessionKeyStrategy: "issue",
  timeoutSec: 600
}')"
RUNTIME='{"heartbeat":{"enabled":false,"intervalSec":0,"wakeOnDemand":true}}'

echo "== Agente $HERMES_NOME"
agente_atual() {
  pc_api GET "/companies/$EMPRESA_ID/agents" |
    jq -c --arg n "$HERMES_NOME" '[.[] | select(.name == $n and .status != "terminated")]'
}
AGENTES="$(agente_atual)"
(($(jq length <<<"$AGENTES") <= 1)) || pc_falhar "há mais de um agente '$HERMES_NOME' no Paperclip; arquive os extras"
AGENTE_ID="$(jq -r '.[0].id // empty' <<<"$AGENTES")"
if [[ -z "$AGENTE_ID" ]]; then
  CONTRATO="$(pc_api POST "/companies/$EMPRESA_ID/agent-hires" "$(jq -nc --arg n "$HERMES_NOME" \
    --argjson a "$ADAPTADOR" --argjson r "$RUNTIME" '{
      name: $n, role: "general", title: "Assistente de operações (Telegram)",
      adapterType: "hermes_gateway", adapterConfig: $a, runtimeConfig: $r, budgetMonthlyCents: 0
    }')")"
  AGENTE_ID="$(jq -r .agent.id <<<"$CONTRATO")"
  echo "   contratação pedida"
else
  pc_api PATCH "/agents/$AGENTE_ID" "$(jq -nc --argjson a "$ADAPTADOR" --argjson r "$RUNTIME" \
    '{adapterType: "hermes_gateway", adapterConfig: $a, runtimeConfig: $r}')" >/dev/null
  echo "   já existe; configuração conferida"
fi

# A trava de contratação deixa o agente em pending_approval até o Davi aprovar o pedido.
STATUS="$(pc_api GET "/agents/$AGENTE_ID" | jq -r .status)"
if [[ "$STATUS" == "pending_approval" ]]; then
  echo "Aprove a contratação do $HERMES_NOME no Paperclip (Aprovações):"
  echo "  $PAPERCLIP_URL_PUBLICA/approvals"
  echo "Esperando a aprovação (até 10 minutos)..."
  limite=$((SECONDS + 600))
  while ((SECONDS < limite)); do
    STATUS="$(pc_api GET "/agents/$AGENTE_ID" | jq -r .status)"
    [[ "$STATUS" == "pending_approval" ]] || break
    sleep 3
  done
fi
case "$STATUS" in
  pending_approval) pc_falhar "tempo esgotado esperando a aprovação da contratação" ;;
  terminated) pc_falhar "a contratação foi recusada" ;;
esac
echo "   status: $STATUS"

echo "== Chave de agente do Hermes"
# Mantém a chave atual se ela ainda vale para este agente; senão cria uma e grava no .env.
CHAVE_ATUAL="$(env_hermes PAPERCLIP_API_KEY)"
CHAVE_VALE=0
if [[ -n "$CHAVE_ATUAL" ]]; then
  (umask 077 && printf 'authorization: Bearer %s\n' "$CHAVE_ATUAL" >"$PC_TMP/cabecalho-hermes")
  if curl -sS -m 30 -H "@$PC_TMP/cabecalho-hermes" "$PAPERCLIP_URL/api/agents/me" 2>/dev/null |
    jq -e --arg id "$AGENTE_ID" '.id == $id' >/dev/null 2>&1; then
    CHAVE_VALE=1
  fi
  rm -f "$PC_TMP/cabecalho-hermes"
fi
unset CHAVE_ATUAL
if [[ $CHAVE_VALE -eq 1 ]]; then
  echo "   a chave do .env continua valendo"
else
  CRIADA="$(pc_api POST "/agents/$AGENTE_ID/keys" '{"name":"hermes-telegram"}')"
  NOVA="$(jq -r .token <<<"$CRIADA")"
  NOVA_ID="$(jq -r .id <<<"$CRIADA")"
  unset CRIADA
  [[ -n "$NOVA" && "$NOVA" != "null" ]] || pc_falhar "o Paperclip não devolveu a chave do agente"
  # As chaves antigas do Hermes não estão mais no .env e ninguém as usa: revoga, para não
  # sobrar credencial esquecida.
  for antiga in $(pc_api GET "/agents/$AGENTE_ID/keys" |
    jq -r --arg nova "$NOVA_ID" '.[] | select((.revokedAt // null) == null and .id != $nova) | .id'); do
    pc_api DELETE "/agents/$AGENTE_ID/keys/$antiga" >/dev/null
    echo "   chave antiga revogada"
  done
  # Grava sem mostrar: arquivo novo com permissão 600, no lugar do antigo.
  (
    umask 077
    grep -v '^PAPERCLIP_API_KEY=' "$HERMES_ENV" >"$HERMES_ENV.novo" || true
    printf 'PAPERCLIP_API_KEY=%s\n' "$NOVA" >>"$HERMES_ENV.novo"
  )
  unset NOVA
  mv "$HERMES_ENV.novo" "$HERMES_ENV"
  echo "   criada e gravada no .env do Hermes"
fi
chmod 600 "$HERMES_ENV"

echo "== Arquivos do Hermes em $HERMES_DADOS"
mkdir -p "$HERMES_DADOS"
cp "$HERMES_DIR/config.yaml" "$HERMES_DADOS/config.yaml"
# SOUL.md com os nomes e a regra de aprovação. Os textos vão por variável de ambiente para o
# awk, assim nenhum caractere da regra é interpretado.
EMPRESA="$PAPERCLIP_EMPRESA" DONO="$DONO" REGRA="$REGRA" awk '{
  gsub(/\{\{EMPRESA\}\}/, ENVIRON["EMPRESA"]); gsub(/\{\{DONO\}\}/, ENVIRON["DONO"])
  if ($0 == "{{REGRA}}") print ENVIRON["REGRA"]; else print
}' "$HERMES_DIR/SOUL.md" >"$HERMES_DADOS/SOUL.md"
# O Hermes carrega dados/.env por cima das variáveis do container, e a imagem copiaria o exemplo
# dela se o arquivo não existisse. Vazio, ele não muda nada; os segredos ficam só no .env de fora.
[[ -f "$HERMES_DADOS/.env" ]] || : >"$HERMES_DADOS/.env"
grep -q . "$HERMES_DADOS/.env" && echo "AVISO: $HERMES_DADOS/.env não está vazio e vale por cima do .env do Hermes" >&2
echo "   config.yaml, SOUL.md e .env"

echo "== Conferência"
AGENTES="$(agente_atual)"
(($(jq length <<<"$AGENTES") == 1)) || pc_falhar "esperava 1 agente '$HERMES_NOME', há $(jq length <<<"$AGENTES")"
jq -e '.[0].adapterType == "hermes_gateway"' <<<"$AGENTES" >/dev/null || pc_falhar "o adaptador não é hermes_gateway"
pc_api GET "/agents/$AGENTE_ID" |
  jq -e '(.runtimeConfig.heartbeat.enabled == false) and ((.runtimeConfig.heartbeat.intervalSec // 0) == 0)' \
    >/dev/null || pc_falhar "o heartbeat agendado não ficou desligado"
CHAVES="$(pc_api GET "/agents/$AGENTE_ID/keys" | jq '[.[] | select((.revokedAt // null) == null)] | length')"
((CHAVES == 1)) || echo "AVISO: o Hermes tem $CHAVES chaves de agente ativas (esperado 1); revogue as extras no Paperclip." >&2
echo "   1 agente $HERMES_NOME (hermes_gateway, sem heartbeat), $CHAVES chave(s) ativa(s)."
echo "Configuração concluída. Suba o Hermes: sudo docker compose up -d --wait"

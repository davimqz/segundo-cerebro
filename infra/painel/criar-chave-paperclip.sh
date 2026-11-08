#!/usr/bin/env bash
# Cria a chave de board do painel no Paperclip (spec 006, ADR 0008) e a grava no .env do painel.
#   - pede uma chave temporária pelo link de aprovação do Paperclip (o Davi aprova no navegador);
#   - cria a chave "painel-aprovacoes" sem validade (expiresAt: null), presa à empresa;
#   - grava PAPERCLIP_CHAVE_BOARD e PAPERCLIP_EMPRESA_ID no .env, sem mostrar a chave na tela;
#   - revoga as chaves "painel-aprovacoes" antigas e, no fim, a chave temporária.
# Rodar de novo troca a chave.
#
# Uso (no servidor): sudo /opt/asttra/painel/criar-chave-paperclip.sh
# Variáveis: o configuracao.env do Paperclip (ao lado de lib.sh, em ../paperclip/). Opcionais:
# PAINEL_ENV (o .env a gravar; padrão: o .env ao lado deste script) e PAPERCLIP_CHAVE (ver lib.sh).
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$AQUI/../paperclip/lib.sh"
pc_carregar_config
: "${PAPERCLIP_EMPRESA:?defina PAPERCLIP_EMPRESA no configuracao.env do Paperclip}"
PAINEL_ENV="${PAINEL_ENV:-$AQUI/.env}"
NOME_CHAVE="painel-aprovacoes"
[[ -f "$PAINEL_ENV" ]] || pc_falhar "não achei o .env do painel em $PAINEL_ENV"
[[ -w "$PAINEL_ENV" ]] || pc_falhar "sem permissão para gravar $PAINEL_ENV (rode com sudo)"

pc_obter_chave criar-chave-paperclip.sh

EMPRESA_ID="$(pc_id_empresa "$PAPERCLIP_EMPRESA")"
[[ -n "$EMPRESA_ID" ]] || pc_falhar "empresa '$PAPERCLIP_EMPRESA' não encontrada. Rode o configurar.sh do Paperclip antes."

ANTIGAS="$(pc_api GET /board-api-keys | jq -r --arg n "$NOME_CHAVE" '.[] | select(.name == $n) | .id')"

echo "== Criando a chave $NOME_CHAVE (sem validade)"
NOVA="$(pc_api POST /board-api-keys "$(jq -nc --arg n "$NOME_CHAVE" --arg e "$EMPRESA_ID" \
  '{name: $n, expiresAt: null, requestedCompanyId: $e}')")" || pc_falhar "o Paperclip não criou a chave"
NOVA_ID="$(jq -r .id <<<"$NOVA")"
jq -e '.expiresAt == null and (.token | startswith("pcp_board_"))' <<<"$NOVA" >/dev/null ||
  pc_falhar "a chave criada tem validade ou formato inesperado"

# Grava no .env sem passar a chave por argumento de comando nem pela tela. Reescreve o arquivo no
# lugar, para manter o dono e a permissão (600).
TMP_ENV="$PC_TMP/painel.env"
grep -vE '^(PAPERCLIP_CHAVE_BOARD|PAPERCLIP_EMPRESA_ID)=' "$PAINEL_ENV" >"$TMP_ENV" || true
{
  printf 'PAPERCLIP_EMPRESA_ID=%s\n' "$EMPRESA_ID"
  jq -r '"PAPERCLIP_CHAVE_BOARD=" + .token' <<<"$NOVA"
} >>"$TMP_ENV"
unset NOVA
cat "$TMP_ENV" >"$PAINEL_ENV"
echo "   gravada em $PAINEL_ENV (PAPERCLIP_CHAVE_BOARD e PAPERCLIP_EMPRESA_ID)"

for id in $ANTIGAS; do
  [[ "$id" == "$NOVA_ID" ]] && continue
  pc_api DELETE "/board-api-keys/$id" >/dev/null || pc_falhar "não consegui revogar a chave antiga $id"
  echo "   chave antiga revogada: $id"
done

echo "Pronto. Reinicie o painel e o bot: cd $(dirname "$PAINEL_ENV") && sudo docker compose up -d"

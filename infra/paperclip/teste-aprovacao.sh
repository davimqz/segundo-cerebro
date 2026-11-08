#!/usr/bin/env bash
# Teste do "Pronto quando" da spec 004: cria um pedido request_board_approval de teste na empresa,
# espera o Davi decidir na tela (Approvals) e imprime o resultado. Termina revogando a chave temporária.
#
# Uso (no servidor): /opt/asttra/paperclip/teste-aprovacao.sh
# Variáveis: configuracao.env ao lado. Opcionais: TITULO (título do pedido), TEMPO_LIMITE (segundos,
# padrão 900) e PAPERCLIP_CHAVE (ver lib.sh).
# Sai com 0 só se o pedido terminar "approved".
set -euo pipefail

# shellcheck source=/dev/null
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
pc_carregar_config
: "${PAPERCLIP_EMPRESA:?defina PAPERCLIP_EMPRESA em configuracao.env}"
TEMPO_LIMITE="${TEMPO_LIMITE:-900}"
TITULO="${TITULO:-Pedido de teste (spec 004)}"

pc_obter_chave teste-aprovacao.sh

EMPRESA_ID="$(pc_id_empresa "$PAPERCLIP_EMPRESA")"
[[ -n "$EMPRESA_ID" ]] || pc_falhar "empresa '$PAPERCLIP_EMPRESA' não encontrada. Rode o configurar.sh antes."

CORPO="$(jq -nc --arg quando "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg titulo "$TITULO" '{
  type: "request_board_approval",
  payload: {
    titulo: $titulo,
    descricao: "Teste da fila de aprovação. Aprovar não dispara nenhuma ação.",
    teste: true,
    criadoEm: $quando
  }
}')"
PEDIDO_ID="$(pc_api POST "/companies/$EMPRESA_ID/approvals" "$CORPO" | jq -r .id)"
[[ -n "$PEDIDO_ID" && "$PEDIDO_ID" != "null" ]] || pc_falhar "o pedido não foi criado"
echo "Pedido criado: $PEDIDO_ID"
echo "Abra Approvals no Paperclip ($PAPERCLIP_URL_PUBLICA) e decida o pedido de teste."

limite=$((SECONDS + TEMPO_LIMITE))
status="pending"
while ((SECONDS < limite)); do
  status="$(pc_api GET "/approvals/$PEDIDO_ID" | jq -r .status)" || pc_falhar "não consegui consultar o pedido"
  [[ "$status" == "pending" ]] || break
  sleep 5
done

echo "Status do pedido: $status"
case "$status" in
  approved) echo "Pronto: o pedido foi aprovado pela tela." ;;
  pending) pc_falhar "tempo esgotado (${TEMPO_LIMITE}s) com o pedido ainda pendente" ;;
  *) pc_falhar "o pedido terminou como '$status', não 'approved'" ;;
esac

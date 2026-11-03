#!/usr/bin/env bash
# Configura a empresa no Paperclip (spec 004). Idempotente: rodar de novo não duplica nada.
#   - cria a empresa PAPERCLIP_EMPRESA, se não existir;
#   - grava na descrição a regra escrita de regra-de-aprovacao.md;
#   - liga a trava de contratação (requireBoardApprovalForNewAgents) e deixa o orçamento em 0;
#   - cria os projetos de PAPERCLIP_PROJETOS que faltarem (um por departamento).
# Não cria agentes.
#
# Uso (no servidor): /opt/asttra/paperclip/configurar.sh
# Variáveis: configuracao.env ao lado (ver configuracao.env.example). PAPERCLIP_CHAVE opcional (ver lib.sh).
set -euo pipefail

# shellcheck source=/dev/null
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
pc_carregar_config
: "${PAPERCLIP_EMPRESA:?defina PAPERCLIP_EMPRESA em configuracao.env}"
: "${PAPERCLIP_PROJETOS:?defina PAPERCLIP_PROJETOS em configuracao.env}"

# A regra escrita: o texto entre <!-- regra --> e <!-- /regra --> do arquivo-fonte.
REGRA="$(sed -n '/^<!-- regra -->$/,/^<!-- \/regra -->$/{//!p}' "$PC_DIR/regra-de-aprovacao.md")"
[[ -n "$REGRA" ]] || pc_falhar "regra vazia em regra-de-aprovacao.md"

IFS=',' read -r -a PROJETOS <<<"$PAPERCLIP_PROJETOS"
for i in "${!PROJETOS[@]}"; do
  PROJETOS[i]="$(sed 's/^[[:space:]]*//; s/[[:space:]]*$//' <<<"${PROJETOS[i]}")"
  [[ -n "${PROJETOS[i]}" ]] || pc_falhar "nome de projeto vazio em PAPERCLIP_PROJETOS"
done

pc_obter_chave configurar.sh instance_admin_required

echo "== Empresa"
EMPRESA_ID="$(pc_id_empresa "$PAPERCLIP_EMPRESA")"
if [[ -z "$EMPRESA_ID" ]]; then
  EMPRESA_ID="$(pc_api POST /companies "$(jq -nc --arg n "$PAPERCLIP_EMPRESA" --arg d "$REGRA" \
    '{name: $n, description: $d, budgetMonthlyCents: 0}')" | jq -r .id)"
  echo "   criada: $PAPERCLIP_EMPRESA"
else
  echo "   já existe: $PAPERCLIP_EMPRESA"
fi

echo "== Regra base: descrição, trava de contratação e orçamento 0"
pc_api PATCH "/companies/$EMPRESA_ID" "$(jq -nc --arg d "$REGRA" \
  '{description: $d, requireBoardApprovalForNewAgents: true, budgetMonthlyCents: 0}')" >/dev/null
echo "   ok"

echo "== Projetos"
EXISTENTES="$(pc_api GET "/companies/$EMPRESA_ID/projects" | jq -c '[.[].name]')"
for nome in "${PROJETOS[@]}"; do
  if jq -e --arg n "$nome" 'index($n) != null' <<<"$EXISTENTES" >/dev/null; then
    echo "   já existe: $nome"
  else
    pc_api POST "/companies/$EMPRESA_ID/projects" "$(jq -nc --arg n "$nome" '{name: $n}')" >/dev/null
    echo "   criado: $nome"
  fi
done

echo "== Conferência"
EMPRESA="$(pc_api GET "/companies/$EMPRESA_ID")"
jq -e '.requireBoardApprovalForNewAgents == true' <<<"$EMPRESA" >/dev/null ||
  pc_falhar "a trava de contratação não ficou ligada"
jq -e '.budgetMonthlyCents == 0' <<<"$EMPRESA" >/dev/null || pc_falhar "o orçamento não ficou em 0"
jq -e --arg d "$REGRA" '.description == $d' <<<"$EMPRESA" >/dev/null || {
  echo "Descrição gravada no Paperclip:" >&2
  jq -r '.description' <<<"$EMPRESA" >&2
  pc_falhar "a descrição não tem a regra"
}
FALTANDO="$(pc_api GET "/companies/$EMPRESA_ID/projects" |
  jq -r --args '[.[].name] as $tem | $ARGS.positional - $tem | .[]' "${PROJETOS[@]}")"
[[ -z "$FALTANDO" ]] || pc_falhar "projetos faltando: $FALTANDO"
echo "   empresa $EMPRESA_ID com ${#PROJETOS[@]} projetos, trava de contratação ligada e orçamento 0."
echo "Configuração concluída."

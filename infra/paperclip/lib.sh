#!/usr/bin/env bash
# Funções comuns de configurar.sh e teste-aprovacao.sh (não roda sozinho).
#
# Chave de board: se PAPERCLIP_CHAVE estiver definida, ela é usada e quem a passou cuida de revogá-la
# (é o caso do teste de integração). Senão, o script pede uma chave temporária pelo fluxo de
# aprovação do próprio Paperclip: mostra um link, o Davi aprova no navegador (já logado) e, no fim,
# o script revoga a chave. A chave nunca é impressa nem gravada em arquivo versionado ou log; ela só
# fica num arquivo temporário com permissão 600, apagado na saída.

PC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PC_TMP=""
PC_REVOGAR=0

pc_falhar() {
  echo "ERRO: $*" >&2
  exit 1
}

# Carrega configuracao.env (CONFIG_ENV muda o arquivo) e confere as variáveis.
pc_carregar_config() {
  local arquivo="${CONFIG_ENV:-$PC_DIR/configuracao.env}"
  if [[ -f "$arquivo" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "$arquivo"
    set +a
  fi
  : "${PAPERCLIP_URL:?defina PAPERCLIP_URL em configuracao.env}"
  PAPERCLIP_URL="${PAPERCLIP_URL%/}"
  PAPERCLIP_URL_PUBLICA="${PAPERCLIP_URL_PUBLICA:-$PAPERCLIP_URL}"
  PAPERCLIP_URL_PUBLICA="${PAPERCLIP_URL_PUBLICA%/}"
  command -v curl >/dev/null || pc_falhar "curl não encontrado"
  command -v jq >/dev/null || pc_falhar "jq não encontrado (instale com: sudo apt install jq)"
  PC_TMP="$(mktemp -d "${TMPDIR:-/tmp}/asttra-paperclip.XXXXXX")"
  chmod 700 "$PC_TMP"
  trap pc_finalizar EXIT
}

pc_finalizar() {
  local codigo=$?
  if [[ $PC_REVOGAR -eq 1 ]]; then
    if pc_api POST /cli-auth/revoke-current '{}' >/dev/null 2>&1; then
      echo "Chave temporária revogada."
    else
      echo "AVISO: não consegui revogar a chave temporária. Revogue em Configurações > Acesso no Paperclip." >&2
      codigo=1
    fi
  fi
  [[ -n "$PC_TMP" ]] && rm -rf "$PC_TMP"
  exit "$codigo"
}

# Chama a API. Uso: pc_api MÉTODO /caminho [corpo JSON]. Imprime a resposta; falha em status >= 400.
# O cabeçalho com a chave vem de um arquivo, para a chave não aparecer na lista de processos.
# O corpo vai pela entrada padrão: como argumento, o curl do Windows estraga os acentos.
pc_api() {
  local metodo="$1" caminho="$2" corpo="${3:-}"
  local args=(-sS --fail-with-body -m 30 -X "$metodo" -H "accept: application/json")
  [[ -f "$PC_TMP/cabecalho" ]] && args+=(-H "@$PC_TMP/cabecalho")
  if [[ -n "$corpo" ]]; then
    printf '%s' "$corpo" |
      curl "${args[@]}" -H "content-type: application/json" --data-binary @- "$PAPERCLIP_URL/api$caminho"
  else
    curl "${args[@]}" "$PAPERCLIP_URL/api$caminho"
  fi
}

pc_usar_chave() {
  (umask 077 && printf 'authorization: Bearer %s\n' "$1" >"$PC_TMP/cabecalho")
}

# Pede uma chave de board temporária. Uso: pc_obter_chave NOME_DO_SCRIPT [board|instance_admin_required]
pc_obter_chave() {
  local nome="$1" acesso="${2:-board}"
  if [[ -n "${PAPERCLIP_CHAVE:-}" ]]; then
    pc_usar_chave "$PAPERCLIP_CHAVE"
    return 0
  fi
  local corpo desafio id segredo caminho chave limite status
  corpo="$(jq -nc --arg c "infra/paperclip/$nome" --arg n "asttra $nome" --arg a "$acesso" \
    '{command: $c, clientName: $n, requestedAccess: $a}')"
  desafio="$(pc_api POST /cli-auth/challenges "$corpo")" || pc_falhar "não consegui iniciar o pedido de acesso"
  id="$(jq -r .id <<<"$desafio")"
  segredo="$(jq -r .token <<<"$desafio")"
  caminho="$(jq -r .approvalPath <<<"$desafio")"
  chave="$(jq -r .boardApiToken <<<"$desafio")"
  unset desafio

  echo "Abra este link no navegador (logado no Paperclip) e clique em aprovar:"
  echo "  $PAPERCLIP_URL_PUBLICA$caminho"
  echo "Esperando a aprovação (até 10 minutos)..."
  limite=$((SECONDS + 600))
  while ((SECONDS < limite)); do
    status="$(pc_api GET "/cli-auth/challenges/$id?token=$segredo" | jq -r .status)" ||
      pc_falhar "não consegui consultar o pedido de acesso"
    case "$status" in
      approved) break ;;
      cancelled) pc_falhar "pedido de acesso cancelado" ;;
      expired) pc_falhar "pedido de acesso expirou" ;;
    esac
    sleep 3
  done
  [[ "$status" == "approved" ]] || pc_falhar "tempo esgotado esperando a aprovação"
  pc_usar_chave "$chave"
  unset chave
  PC_REVOGAR=1
  echo "Acesso aprovado."
}

# Imprime o id da empresa com o nome dado (vazio se não existir). Ignora empresas arquivadas.
pc_id_empresa() {
  pc_api GET /companies | jq -r --arg n "$1" \
    '[.[] | select(.name == $n and .status != "archived")][0].id // empty'
}

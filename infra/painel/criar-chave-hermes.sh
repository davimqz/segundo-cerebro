#!/usr/bin/env bash
# Cria a chave de agente do Hermes no painel (spec 007, ADR 0009) e a grava no .env do Hermes.
#   - cria, dentro do container do painel, uma chave do agente "hermes" com os escopos de leitura e
#     o de registrar tarefas;
#   - grava PAINEL_API_KEY no .env do Hermes (e PAINEL_API_URL, se faltar), sem mostrar a chave na
#     tela nem passá-la por argumento de comando, mantendo o dono e a permissão (600);
#   - só depois revoga as chaves antigas do "hermes".
# Rodar de novo troca a chave. Depois, recrie o Hermes para ele ler a chave nova.
#
# Uso (no servidor): sudo /opt/asttra/painel/criar-chave-hermes.sh
# Variáveis opcionais: HERMES_ENV (o .env a gravar; padrão: ../hermes/.env a partir deste script).
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_ENV="${HERMES_ENV:-$AQUI/../hermes/.env}"
AGENTE="hermes"
ESCOPOS="departamentos:ler,atividades:ler,avisos:ler,tarefas:registrar"
URL_PADRAO="http://painel:3000"

falhar() {
  echo "ERRO: $*" >&2
  exit 1
}

[[ -f "$HERMES_ENV" ]] || falhar "não achei o .env do Hermes em $HERMES_ENV"
[[ -w "$HERMES_ENV" ]] || falhar "sem permissão para gravar $HERMES_ENV (rode com sudo)"
command -v docker >/dev/null || falhar "docker não encontrado"

TMP="$(mktemp -d)"
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT

painel() { docker compose --project-directory "$AQUI" exec -T painel "$@"; }

echo "== Criando a chave do agente $AGENTE ($ESCOPOS)"
# A saída padrão do comando tem só a chave; os avisos dele vão para a tela pela saída de erro.
CHAVE="$(painel node servidor/dist-scripts/chave.mjs criar "$AGENTE" --escopos "$ESCOPOS")" ||
  falhar "o painel não criou a chave (ele está no ar? rode: cd $AQUI && sudo docker compose ps)"
CHAVE="${CHAVE//$'\r'/}"
[[ "$CHAVE" =~ ^pnl_[A-Za-z0-9_-]{43}$ ]] || falhar "a chave criada tem formato inesperado"

# Grava no .env sem passar a chave por argumento de comando (printf é interno do bash) nem pela tela.
# Reescreve o arquivo no lugar, para manter o dono e a permissão (600).
TMP_ENV="$TMP/hermes.env"
grep -v '^PAINEL_API_KEY=' "$HERMES_ENV" >"$TMP_ENV" || true
if ! grep -q '^PAINEL_API_URL=' "$TMP_ENV"; then
  printf 'PAINEL_API_URL=%s\n' "$URL_PADRAO" >>"$TMP_ENV"
fi
printf 'PAINEL_API_KEY=%s\n' "$CHAVE" >>"$TMP_ENV"
unset CHAVE
cat "$TMP_ENV" >"$HERMES_ENV"
echo "   gravada em $HERMES_ENV (PAINEL_API_KEY)"

# A chave nova já está no .env: agora as antigas podem sair.
painel node servidor/dist-scripts/chave.mjs revogar --agente "$AGENTE" --manter-ultima ||
  falhar "não consegui revogar as chaves antigas (a nova já está gravada; rode o script de novo)"

echo "Pronto. Recrie o Hermes para ele ler a chave: cd $(dirname "$HERMES_ENV") && sudo docker compose up -d --force-recreate --wait"

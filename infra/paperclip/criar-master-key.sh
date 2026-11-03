#!/usr/bin/env bash
# Cria a master.key do Paperclip na pasta de dados, antes da primeira subida.
#
# O Paperclip só cria a chave quando grava o primeiro segredo. Criando já na instalação, ela entra
# no backup diário desde o primeiro dia (spec 004). O formato é o mesmo que o Paperclip usa:
# 32 bytes aleatórios em base64, permissão 600. A chave é gerada dentro do container (usuário 1000)
# e nunca aparece na tela. Se a chave já existe, não faz nada.
#
# Uso (no servidor): sudo /opt/asttra/paperclip/criar-master-key.sh
set -euo pipefail

DIR_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

docker compose --project-directory "$DIR_SCRIPT" run --rm --no-deps --entrypoint sh paperclip -c '
  k=/paperclip/instances/default/secrets/master.key
  if [ -e "$k" ]; then
    echo "A master.key já existe. Nada a fazer."
    exit 0
  fi
  mkdir -p "${k%/*}"
  chmod 700 "${k%/*}"
  umask 077
  head -c 32 /dev/urandom | base64 >"$k"
  echo "master.key criada."
'

#!/usr/bin/env bash
# Gera o convite do primeiro admin do Paperclip (o "bootstrap CEO" do modo authenticated).
#
# Faz o mesmo que o "paperclipai auth bootstrap-ceo" da CLI oficial, que não funciona dentro do
# container (ela exige um config.json que a instalação por Docker não tem): grava no banco
# "paperclip" um convite de uso único, guardando só o hash SHA-256 do token, e mostra o link.
# Recusa se já houver admin. O convite vale 1 hora.
#
# Uso (no servidor): sudo /opt/asttra/paperclip/convite-admin.sh
# Variáveis: configuracao.env ao lado (PAPERCLIP_URL_PUBLICA). Opcional: BANCO_DIR (padrão
# /opt/asttra/banco, a pasta do compose.yml do PostgreSQL).
set -euo pipefail

DIR_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BANCO_DIR="${BANCO_DIR:-/opt/asttra/banco}"
CONFIG_ENV="${CONFIG_ENV:-$DIR_SCRIPT/configuracao.env}"
if [[ -f "$CONFIG_ENV" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$CONFIG_ENV"
  set +a
fi
: "${PAPERCLIP_URL_PUBLICA:?defina PAPERCLIP_URL_PUBLICA em configuracao.env}"

psql_paperclip() {
  docker compose --project-directory "$BANCO_DIR" exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U postgres -d paperclip -At "$@"
}

admins="$(psql_paperclip -c "SELECT count(*) FROM instance_user_roles WHERE role = 'instance_admin'")"
if [[ "$admins" != "0" ]]; then
  echo "O Paperclip já tem admin. Nada a fazer." >&2
  exit 1
fi

token="pcp_bootstrap_$(openssl rand -hex 24)"
hash="$(printf '%s' "$token" | sha256sum | cut -d' ' -f1)"

# Revoga convites de bootstrap ainda abertos e cria o novo (como a CLI oficial).
psql_paperclip -q -v hash="$hash" <<'SQL'
BEGIN;
UPDATE invites SET revoked_at = now(), updated_at = now()
WHERE invite_type = 'bootstrap_ceo' AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at > now();
INSERT INTO invites (invite_type, token_hash, allowed_join_types, expires_at, invited_by_user_id)
VALUES ('bootstrap_ceo', :'hash', 'human', now() + interval '1 hour', 'system');
COMMIT;
SQL

echo "Convite do primeiro admin criado (vale 1 hora, uso único)."
echo "Abra no navegador, crie a conta com o seu e-mail e aceite o convite:"
echo "  ${PAPERCLIP_URL_PUBLICA%/}/invite/$token"

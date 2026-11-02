# 001. Banco de dados, Redis e backup diário no R2

- Risco: R2 (infraestrutura, banco de dados e segredos)
- Origem: Build Plan, Etapa 1, item 2; PRD RNF06; TRD, seções "Dados" e "Rede"
- Status: Aprovada

## Objetivo
Subir no servidor a instância única de PostgreSQL 18, com um banco e um usuário por serviço (`painel`, `n8n` e `paperclip`), e o Redis 8 compartilhado. Também entra o backup diário criptografado no Cloudflare R2, com aviso quando falhar. É a base que o painel (item 3), o Paperclip (item 5) e o n8n (item 8) vão usar.

## Critérios de aceite
- Quando `docker compose up -d` roda em `/opt/asttra/banco/`, o PostgreSQL e o Redis devem ficar `healthy`. O PostgreSQL deve escutar só em `127.0.0.1:5432` no servidor, e o Redis não deve publicar porta nenhuma.
- Quando o usuário `painel` conecta no banco `painel`, a conexão deve funcionar. Quando ele tenta conectar no banco `n8n` ou `paperclip`, deve ser recusada. O mesmo vale para os usuários `n8n` e `paperclip`.
- Quando um cliente conecta no Redis sem senha, o Redis deve recusar (`NOAUTH`).
- Quando o servidor reinicia, os dois containers devem voltar sozinhos e os dados devem continuar lá.
- Quando o timer dispara às 03:00 (horário de Brasília), deve aparecer no bucket `asttra-backups` um snapshot novo do restic, com o dump de cada banco e os usuários e permissões (`globals`). O Healthchecks.io deve receber o aviso de sucesso.
- Quando o backup falha (por exemplo, chave do R2 errada ou banco parado), o script deve terminar com erro, avisar o Healthchecks.io pela URL `/fail` e apagar os dumps temporários. Você deve receber o e-mail do Healthchecks.io.
- Quando o backup não roda no dia (servidor desligado às 03:00), o Healthchecks.io deve mandar e-mail depois do prazo. O timer deve rodar o backup perdido quando o servidor voltar (`Persistent=true`).
- Quando há mais cópias do que a retenção, o restic deve manter só as 7 diárias e as 4 semanais mais recentes.
- Quando `restaurar.sh` roda, o último snapshot deve ser restaurado num banco de teste separado, com as mesmas tabelas e o mesmo número de linhas do original. O banco de produção não deve ser tocado.
- Quando o Gitleaks analisa o repositório, nenhum segredo deve aparecer. Só os arquivos `.env.example` vão para o Git.

## Fora de escopo
- Instalar o painel, o n8n ou o Paperclip. Aqui só são criados os bancos e usuários deles.
- Backup da base de conhecimento. Ela ainda não está no servidor e já tem cópia no GitHub. Entra quando o Hermes ganhar a cópia local.
- Bucket Lock no R2: vai para "Ideias".
- Mover o Cloudflare Tunnel de `~/infra/cloudflared` para `/opt/asttra/`: vai para "Ideias".
- Teste de restauração mensal automático. Agora ele fica como procedimento manual no playbook.
- Aviso de falha pelo Telegram: entra no item 6, junto com o Hermes.
- Ajuste fino de desempenho do PostgreSQL além do básico para 8 GB de RAM.

## Arquivos e interfaces
Neste repositório, copiados para `/opt/asttra/banco/` no servidor:
- `infra/banco/compose.yml`: serviços `postgres` (imagem `postgres:18`, com a versão exata fixada) e `redis` (imagem `redis:8`, com a versão exata fixada).
  - Os dois usam `restart: unless-stopped`, healthcheck (`pg_isready` e `redis-cli ping`), limite de memória (1 GB e 300 MB) e volumes nomeados.
  - No PostgreSQL 18, o volume é montado em `/var/lib/postgresql`, que mudou em relação às versões anteriores.
  - Os dois ficam na rede Docker externa `asttra`, que os próximos serviços também vão usar.
- `infra/banco/init/01-bancos.sh`: roda só na primeira inicialização (`docker-entrypoint-initdb.d`).
  - Cria os usuários `painel`, `n8n` e `paperclip` com as senhas do `.env`.
  - Cria um banco para cada um, com o usuário como dono.
  - Faz `REVOKE CONNECT ... FROM PUBLIC` em cada banco.
- `infra/banco/redis.conf`: `appendonly yes`, `maxmemory 256mb` e `maxmemory-policy noeviction`, porque filas não podem perder itens. A senha é passada pelo `.env`.
- `infra/banco/.env.example`: nomes das variáveis sem valores. São elas `POSTGRES_PASSWORD`, `PAINEL_DB_PASSWORD`, `N8N_DB_PASSWORD`, `PAPERCLIP_DB_PASSWORD` e `REDIS_PASSWORD`.
- `infra/banco/backup/backup.sh`, em quatro passos:
  1. Avisa o início ao Healthchecks.io.
  2. Gera `pg_dumpall --globals-only` e `pg_dump -Fc` de cada banco, num diretório temporário.
  3. Roda `restic backup` e depois `restic forget --keep-daily 7 --keep-weekly 4 --prune`.
  4. Avisa sucesso ou falha e apaga os temporários em qualquer caso (`trap`).
- `infra/banco/backup/restaurar.sh`: restaura um snapshot (o último, se nenhum for informado) num banco `restauracao_teste` e compara a contagem de linhas por tabela com o original.
- `infra/banco/backup/backup.env.example`: `RESTIC_REPOSITORY`, `RESTIC_PASSWORD`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` e `HC_PING_URL`.
- `infra/banco/backup/asttra-backup.service` e `asttra-backup.timer`: unidade do systemd com `OnCalendar=*-*-* 03:00:00 America/Sao_Paulo` e `Persistent=true`. Os logs ficam no `journalctl`.
- `.github/dependabot.yml`: adicionar o ecossistema `docker` em `infra/banco`.
- `.github/workflows/ci.yml` e `scripts/check.sh`: ShellCheck nos scripts e o teste de integração descrito abaixo.
- `docs/00-playbook-infra.md`: novo capítulo "Banco e backup", com a restauração manual mensal e o que fazer se a senha do restic se perder.
- `docs/06-build-plan.md`: Bucket Lock e mudança do tunnel em "Ideias".
- `CLAUDE.md`: linha do backup na seção de infraestrutura.

**Só no servidor (nunca no Git):**
- `/opt/asttra/banco/.env` e `/opt/asttra/banco/backup/backup.env`, com permissão `600` e dono `root`.
- A `RESTIC_PASSWORD` também fica no seu gerenciador de senhas. Sem ela, nenhum backup pode ser restaurado.

**Programas novos no servidor:** `restic`, instalado pelo apt (licença BSD-2), e a conta gratuita no Healthchecks.io (plano Hobby, sem cartão).

**ADR proposto:** 0003, "Backup com restic e alerta pelo Healthchecks.io". Ele registra a escolha contra a alternativa pg_dump + rclone.

## Decisões confirmadas (2026-11-02)
- **Cópia para o servidor:** com `scp` a partir do Windows. Clone com deploy key fica para quando houver mais serviços.
- **Healthchecks.io:** período de 1 dia e tolerância de 2 horas. Uma falha avisa na hora, pela URL `/fail`.
- **Redis:** uma senha só, compartilhada pelos serviços internos, sem usuários separados (ACL).

## Mudanças na implementação (2026-11-02)
- **Dependabot:** ecossistema `docker-compose` em vez de `docker`, porque o `docker` só lê Dockerfiles.
- **`sudo docker compose`:** como o `.env` é do root com permissão `600`, os comandos do compose em `/opt/asttra/banco` usam `sudo`.
- **Senha do Redis:** vai para um arquivo em tmpfs incluído na config (`--include`), e não para a linha de comando, para não aparecer no `ps`.
- **Retenção:** `restic forget` usa `--group-by host,tags`. Sem isso, o caminho temporário, que muda a cada execução, impediria a retenção de apagar cópias. Há um teste para esse caso.
- **R2:** o playbook ganhou o passo de criar o bucket `asttra-backups` e o token, que o plano não citava.
- **`.gitignore`:** passou a ignorar `*.env` (protege o `backup.env`), mantendo os `*.env.example`.

## Perguntas em aberto
- Nenhuma.

## Plano
1. **No Windows:** criar `infra/banco/` com o compose, o init, o `redis.conf`, os `.env.example`, os scripts e as unidades do systemd.
2. **No Windows:** adicionar ShellCheck e o teste de integração no `scripts/check.sh` e no CI, e o ecossistema docker no Dependabot.
3. **No navegador:** criar a conta e a checagem no Healthchecks.io (período de 1 dia, tolerância de 2 horas, fuso America/Sao_Paulo) e guardar a URL de ping no gerenciador de senhas.
4. **No servidor:**
   - criar `/opt/asttra/banco/` e a rede `asttra` (`docker network create asttra`);
   - copiar os arquivos com `scp -r infra/banco <alias-do-servidor>:/tmp/banco` (no Windows) e mover para `/opt/asttra/banco/` (no servidor);
   - criar os `.env`, com as senhas digitadas com `read -rp`, como no tunnel, e geradas com `openssl rand`.
5. **No servidor:** `docker compose up -d` e conferir os critérios de containers, portas, usuários e Redis.
6. **No servidor:** instalar o restic, rodar `restic init` no R2 e rodar o `backup.sh` uma vez à mão.
7. **No servidor:** instalar e ativar o timer (`systemctl enable --now asttra-backup.timer`).
8. **No servidor:** rodar o `restaurar.sh` e testar a falha, trocando a chave temporariamente e confirmando o e-mail.
9. **No Windows:** atualizar o playbook, o Build Plan e o `CLAUDE.md`, propor o ADR 0003 e abrir o PR.

**Testes previstos:**
- Unidade: ShellCheck em todos os scripts `.sh`.
- Integração, no CI e no `scripts/check.sh`, com um script que:
  - sobe o compose com senhas de teste;
  - confere que cada usuário conecta só no próprio banco e que o Redis recusa conexão sem senha;
  - roda `backup.sh` contra um repositório restic local (`RESTIC_REPOSITORY=/tmp/...`), sem R2 e com o ping desligado;
  - roda `restaurar.sh` e confere as contagens.
- E2E: não se aplica. A prova final é a verificação no servidor.

## Verificação de ponta a ponta
No servidor:
1. `docker compose ps` mostra `postgres` e `redis` como `healthy`.
2. `ss -tlnp` mostra a porta 5432 só em `127.0.0.1` e nenhuma porta do Redis.
3. `psql` com o usuário `painel` entra no banco `painel` e é recusado no banco `n8n`.
4. `sudo systemctl start asttra-backup.service` termina sem erro.
5. `restic snapshots` lista o snapshot, que aparece também no painel do R2. O Healthchecks.io fica verde.
6. `restaurar.sh` termina com "contagens iguais".

No Windows:
7. Um túnel `ssh -L 5432:127.0.0.1:5432` permite conectar no banco `painel` pelo DBeaver.

No dia seguinte:
8. Às 03:00 aparece um snapshot novo sem nenhuma ação manual.

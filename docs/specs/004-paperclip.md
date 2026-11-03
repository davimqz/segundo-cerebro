# 004. Paperclip

- Risco: R2
- Origem: Build Plan, Etapa 1, item 5; PRD, RF02 e RF03 e "Fase 1 – MVP"; TRD, "Componentes", "Rede", "Dados" e "Riscos técnicos"; App Flow, "Fluxo de aprovação"
- Status: Rascunho

## Objetivo
O Paperclip é onde ficam as tarefas e os pedidos de aprovação dos agentes (PRD, RF02 e RF03). Este item instala o Paperclip no servidor, em `agentes.asttralabs.com.br`. Ele usa o banco `paperclip`, que já existe, e tem a empresa, os 5 departamentos e a regra base de aprovação configurados. O Hermes só entra no item 6. Aqui basta provar que um pedido de aprovação criado pela API aparece na tela e pode ser aprovado.

**Risco R2:** é infraestrutura nova exposta na web, com segredos novos, ligada ao banco, com login próprio e uma integração externa (código de terceiros, numa versão jovem). Ela também cuida da regra nº 1, a aprovação humana.

**Decisões do Davi (2026-11-03):**
- Os departamentos viram 5 projetos dentro de uma empresa. Não são agentes, porque o único agente permanente é o Hermes.
- O Paperclip usa o nosso PostgreSQL 18.
- A imagem é construída no servidor a partir de uma versão fixa, como no ADR 0005.
- O teste é feito pela API, com `curl`.
- A regra base tem três partes: a trava de contratação, o orçamento zero e a regra escrita.

## Critérios de aceite
**Instalação e rede**
- Quando o container sobe, o Paperclip deve escutar só em `127.0.0.1:18100` no servidor, ficar `healthy` e não publicar nenhuma outra porta. O UFW continua liberando só o SSH.
- Quando alguém abre `agentes.asttralabs.com.br`, o sistema deve pedir primeiro o código do Cloudflare Access (policy `Só Davi`) e depois o login do próprio Paperclip, no modo `authenticated` + `private`.
- Quando o container é recriado, nada deve se perder: os dados ficam no banco `paperclip` e na pasta `/opt/asttra/paperclip/dados`, que inclui a chave `master.key`.
- Quando o Paperclip roda, a telemetria deve estar desligada (`PAPERCLIP_TELEMETRY_DISABLED=1` e `DO_NOT_TRACK=1`), e o Cloud Connector, o Sentry e o OpenTelemetry devem ficar sem configuração.

**Banco**
- Quando o Paperclip inicia apontando para o banco `paperclip` (usuário `paperclip`), as migrações dele devem rodar sem erro no PostgreSQL 18. Ele não deve usar o banco embutido nem ter acesso aos bancos `painel` e `n8n`.
- Se as migrações falharem no PostgreSQL 18, a implantação para e volta para o Davi decidir. Não se troca para o banco embutido nem para outra versão sem aprovação.

**Empresa e departamentos**
- Quando a configuração termina, deve existir uma empresa com o nome vindo do `.env` de configuração (na Asttra, "Asttra Labs"). Ela deve ter 5 projetos: Crescimento, Entrega, Clientes, Administração e Direção. Os nomes saem da tabela `departamentos` do painel, para a estrutura poder ser replicada, e nada fica fixo no código.
- Nenhum agente é criado neste item.

**Regra base de aprovação**
- Quando um agente tenta contratar outro agente, o Paperclip deve exigir aprovação do board (`hire_agent`). A trava nativa fica ligada.
- O orçamento mensal da empresa fica em zero. Na implantação, conferir se o orçamento zero pausa também os agentes que usam modelos gratuitos. Se pausar, a implantação para e volta para o Davi.
- A meta ou descrição da empresa no Paperclip deve conter a regra escrita: "Tudo que sai da empresa, publica, gasta dinheiro, aceita termos ou apaga dados vira um pedido `request_board_approval` e espera a decisão do Davi. Ler, pesquisar, resumir, organizar, criar tarefas internas e preparar rascunhos não precisa de aprovação." O mesmo texto fica em `infra/paperclip/regra-de-aprovacao.md`, que é a fonte, porque o PRD manda manter a regra também fora do Paperclip.

**Pedido de aprovação de teste (Pronto quando)**
- Quando o script de teste roda no servidor com uma chave de board temporária, ele deve criar um pedido `request_board_approval` com `payload` de teste. O pedido deve aparecer como pendente na fila de aprovações da tela.
- Quando o Davi clica em "Aprovar" na tela, o pedido deve passar para `approved`, e `GET /api/approvals/{id}` deve confirmar isso.
- Quando o teste termina, a chave temporária deve ser revogada. Ela nunca é gravada em arquivo versionado nem em log.

## Fora de escopo
- O Hermes, o adaptador `hermes_local`, o Telegram e a criação de agentes (item 6).
- Mostrar aprovações e tarefas do Paperclip no painel, e gravar em `atividades` as decisões tomadas no Paperclip (itens 6 e 7). A auditoria deste item fica no registro do próprio Paperclip.
- O atalho para o Paperclip em Configurações do painel.
- Chaves de API do OpenAI ou da Anthropic: nenhum modelo pago é configurado.
- O Team Catalog, as rotinas, as metas por departamento e os orçamentos por projeto.
- Atualização automática de versão: trocar a versão é um passo manual e deliberado.

## Arquivos e interfaces
- `infra/paperclip/compose.yml` (novo): serviço `paperclip` construído de `${PAPERCLIP_SRC}` com `--target production` e imagem `asttra-paperclip:<versão>`. Tem:
  - porta `127.0.0.1:18100:3100`, rede `asttra`, `mem_limit` de 1 GB e `pids_limit`;
  - `no-new-privileges` e usuário não root (a imagem já não roda como root; o PostgreSQL embutido recusa root);
  - volume `./dados:/paperclip`, `healthcheck` e `restart: unless-stopped`.
- `infra/paperclip/.env.example` (novo): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `PAPERCLIP_AGENT_JWT_SECRET`, `PAPERCLIP_TOOL_ACTION_SIGNING_SECRET`, `PAPERCLIP_PUBLIC_URL`, `PAPERCLIP_AUTH_PUBLIC_BASE_URL`, `PAPERCLIP_ALLOWED_HOSTNAMES`, `PAPERCLIP_DEPLOYMENT_MODE=authenticated`, `PAPERCLIP_DEPLOYMENT_EXPOSURE=private`, `TRUST_PROXY=1`, `PAPERCLIP_TELEMETRY_DISABLED=1`, `DO_NOT_TRACK=1` e `PAPERCLIP_VERSAO`. Os segredos ficam vazios, com a instrução `openssl rand -hex 32`, um valor diferente para cada um.
- `infra/paperclip/configurar.sh` (novo, idempotente, ou seja, rodar de novo não duplica nada): cria a empresa, os 5 projetos (lidos da tabela `departamentos` pela API do painel ou de uma lista no `.env`), liga a trava de contratação, zera o orçamento e grava a regra escrita. Usa a API do Paperclip com a chave de board passada por variável de ambiente.
- `infra/paperclip/teste-aprovacao.sh` (novo): cria o pedido de teste, espera o Davi aprovar na tela (consulta o status a cada poucos segundos, com tempo-limite) e imprime o resultado.
- `infra/paperclip/regra-de-aprovacao.md` (novo): o texto da regra base.
- `infra/banco/backup/backup.sh`: **proposta, a confirmar** (ver "Perguntas em aberto"). Incluir `/opt/asttra/paperclip/dados` no restic, com a tag `paperclip`, e a mesma retenção.
- `scripts/check.sh`: o ShellCheck passa a cobrir os scripts novos.
- `docs/00-playbook-infra.md`: novo capítulo "Paperclip" com o passo a passo, cada comando dizendo onde roda, e uma tabela de erros comuns.
- `docs/adr/0006-paperclip-construido-no-servidor-com-postgresql-externo.md` (proposto): por que construir de uma tag fixa e usar o PostgreSQL 18 compartilhado em vez do banco embutido.
- Cloudflare (feito à mão, registrado no playbook): rota `agentes.asttralabs.com.br` → `http://localhost:18100` no tunnel `vps-asttra` e aplicação no Access com a policy `Só Davi`.

## Perguntas em aberto
- **Backup da pasta de dados:** sem a `master.key`, os segredos guardados no Paperclip ficam ilegíveis numa restauração. A proposta é incluir `/opt/asttra/paperclip/dados` no backup diário. Isso não foi pedido; confirmar antes de implementar.
- **PostgreSQL 18:** a documentação só mostra a versão 17. Isso só se descobre na implantação (ver o critério do banco).
- **Orçamento zero e modelos gratuitos:** é preciso confirmar na implantação se o orçamento zero bloqueia também os modelos gratuitos.
- **Primeiro login:** a documentação descreve o `paperclipai auth bootstrap-ceo` e o "primeiro login vira admin" no modo privado, mas não explica como fazer isso dentro do Docker. Testar o caminho e registrar no playbook.
- **Versão:** fixar a release mais recente na data da implantação (a última vista é `v2026.1023.0`, de 2026-10-23) e conferir as issues abertas sobre instalações próprias antes.

## Plano
1. **ADR 0006:** registrar a decisão da instalação e do banco (`/asttra:adr`), com a aprovação do Davi.
2. **Compose e `.env.example`:** escrever `infra/paperclip/`. Testar no Windows com Docker, contra um PostgreSQL 18 descartável: build, migrações, `healthy` e a porta só em `127.0.0.1`.
3. **Scripts:** `configurar.sh`, `teste-aprovacao.sh` e `regra-de-aprovacao.md`. Rodar localmente duas vezes seguidas para provar que não duplicam nada.
4. **Backup** (se o Davi confirmar): incluir a pasta de dados no `backup.sh` e no teste do banco.
5. **Playbook:** capítulo "Paperclip". Um bloco de comando por vez, dizendo onde rodar (Windows/PowerShell, servidor ou navegador).
6. **Implantação no servidor**, guiada pelo playbook:
   - clonar a tag, construir, criar o `.env` com `chmod 600` e subir;
   - criar a rota no tunnel e a aplicação no Access;
   - criar o admin, rodar o `configurar.sh` e depois o `teste-aprovacao.sh`.
7. **Docs:** marcar o item 5 no Build Plan, atualizar o "Próximo passo" e a seção de infraestrutura no `CLAUDE.md` e confirmar o subdomínio no TRD.

**Testes previstos:**
- Unidade: não se aplica, porque não há código do painel neste item. O ShellCheck cobre os scripts.
- Integração: um novo `scripts/teste-paperclip.sh`, que roda no CI. Ele sobe um PostgreSQL 18 descartável e o Paperclip numa tag fixa, depois:
  - confere as migrações e o `/api/health`;
  - roda o `configurar.sh` duas vezes e confere 1 empresa, 5 projetos, a trava de contratação ligada e o orçamento zero;
  - cria um `request_board_approval`, aprova pela API e confere o `approved`.
- E2E: não se aplica no CI. A aprovação pela tela é a verificação manual abaixo.

**Comandos de verificação:**
- `scripts/check.sh`
- `scripts/teste-paperclip.sh`
- No servidor: `ss -tlnp | grep 18100` (deve mostrar só `127.0.0.1`), `sudo ufw status` (só OpenSSH) e `docker compose ps` (`healthy`).

## Verificação de ponta a ponta
1. No celular, fora da rede de casa, abrir `agentes.asttralabs.com.br`. Deve aparecer primeiro o código da Cloudflare e depois o login do Paperclip.
2. Depois de entrar, ver a empresa com os 5 projetos e a regra escrita na meta da empresa.
3. No servidor, rodar `infra/paperclip/teste-aprovacao.sh`. O pedido de teste deve aparecer em "Approvals" como pendente.
4. Clicar em "Aprovar" na tela. O script deve imprimir `approved` e terminar revogando a chave temporária.
5. Recriar o container (`docker compose up -d --force-recreate`). A empresa, os projetos e o pedido aprovado devem continuar lá.

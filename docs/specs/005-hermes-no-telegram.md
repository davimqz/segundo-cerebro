# 005. Hermes no Telegram

- Risco: R2
- Origem: Build Plan, Etapa 1, item 6a; PRD, RF05 e "Modelo de agentes"; TRD, "Rede e segurança", "Integrações" e "Modelo de IA"; App Flow, "Pedir uma tarefa"
- Status: Rascunho

## Objetivo
Davi conversa com o Hermes por um bot do Telegram e pede tarefas em linguagem natural. Antes de agir, o Hermes confirma o que entendeu. Depois do "sim", ele cria a tarefa no projeto certo do Paperclip (RF05). Este item instala o Hermes no servidor, num container próprio, com modelos gratuitos do OpenRouter. O Hermes passa a ser o primeiro agente do Paperclip. As aprovações pelo painel e pelo Telegram ficam para o item 6b (spec 006).

**Risco R2:** é infraestrutura nova, com segredos novos (dois tokens e uma chave de agente), uma integração externa (Telegram e OpenRouter) e um agente que recebe ordens de fora.

**Decisões do Davi (2026-11-03):**
- **Ligação (1A):** o Hermes fica em container próprio. O Paperclip o chama pelo adaptador `hermes_gateway`, na rede interna. O Hermes fala com o Paperclip pela API, com uma chave de agente. O `hermes_local`, que exigiria o Hermes dentro da imagem do Paperclip, fica descartado.
- **Sem terminal (3A):** neste item, as ferramentas de terminal e de execução de código ficam desligadas. O container não recebe o socket do Docker. Isso substitui, por enquanto, o `terminal.backend docker` do TRD.
- **Modelo (4A):** só modelos `:free` do OpenRouter, numa conta sem créditos. O modelo é escolhido na implantação, depois de ler os termos de dados, e fica no `.env`.
- **Confirmação (6A):** antes de criar ou mudar qualquer coisa (tarefa, rascunho, pedido), o Hermes devolve o que entendeu e espera o "sim". Perguntas e pesquisas ele responde direto.
- **Dois bots (7):** um bot para conversar com o Hermes (este item) e outro, do painel, só para aprovações (item 6b).
- **Divisão (5):** o item 6 virou 6a (esta spec) e 6b (aprovações no painel e no Telegram, ao mesmo tempo).

## Critérios de aceite
**Instalação e rede**
- Quando o container sobe, o Hermes deve rodar `gateway run` a partir da imagem oficial `nousresearch/hermes-agent`, presa pelo digest (`HERMES_IMAGEM`). Ele não deve publicar nenhuma porta no servidor e deve ficar `healthy`.
- Quando o Hermes roda, ele deve:
  - estar só na rede `asttra`, sem o socket do Docker montado;
  - ter `no-new-privileges`, `mem_limit` e `pids_limit`;
  - usar um usuário sem root, se a imagem permitir (ver Perguntas em aberto).
- Quando o gateway do Telegram está no ar, ele deve buscar as mensagens (long polling), sem webhook. O UFW continua liberando só o SSH.
- Quando o container é recriado, a memória, as sessões e as skills devem continuar lá, porque ficam em `/opt/asttra/hermes/dados`.

**Telegram**
- Quando Davi escreve ao bot do Hermes, o Hermes deve responder no Telegram.
- Quando outra pessoa escreve ao bot, o Hermes não deve responder nem agir. A lista de quem pode falar é `TELEGRAM_ALLOWED_USERS` e tem só o ID numérico do Davi. Sem a lista, o Hermes nega todo mundo.

**Confirmação antes de agir**
- Quando Davi pede algo que cria ou muda um registro, o Hermes deve primeiro responder com o que entendeu: a ação, o departamento (projeto), o título e a descrição. Depois ele espera.
  - Se Davi responde "sim", ele executa.
  - Se Davi corrige, ele confirma de novo.
  - Se Davi responde "não", ele não faz nada.
- Quando Davi faz uma pergunta ou pede uma pesquisa, o Hermes deve responder direto, sem pedir confirmação.
- A regra fica escrita nas instruções do Hermes (`infra/hermes/SOUL.md`). Ela é um comportamento do modelo, não uma trava: a trava para o que sai da empresa é a aprovação do item 6b.

**Paperclip**
- Quando o `configurar.sh` do Hermes roda, deve existir no Paperclip um agente "Hermes" com o adaptador `hermes_gateway`, apontando para `http://hermes:8642` na rede `asttra`, com a chave da API do Hermes guardada como segredo do Paperclip. O script deve criar uma chave de agente para o Hermes e gravá-la direto no `.env` do Hermes (`chmod 600`), sem mostrar na tela. Rodar o script de novo não deve duplicar nada.
- Quando Davi confirma uma tarefa, o Hermes deve criá-la no projeto do departamento certo, entre os 5 de `PAPERCLIP_PROJETOS`, e responder no Telegram com o título e o link da tarefa em `agentes.asttralabs.com.br`.
- Quando o departamento não está claro, o Hermes deve perguntar, em vez de escolher sozinho.
- Quando o Paperclip está fora do ar ou recusa a chave, o Hermes deve avisar no Telegram que não conseguiu criar a tarefa e não deve dizer que criou.
- O agente Hermes no Paperclip não deve ter heartbeat agendado: ele só acorda quando recebe uma tarefa. Assim ele não gasta o limite diário do modelo gratuito à toa.
- A API do Hermes (`API_SERVER_ENABLED`) deve escutar só dentro da rede `asttra` e exigir `API_SERVER_KEY`, recusando pedidos sem a chave com 401.

**Modelo e limites**
- Quando o Hermes chama um modelo, deve ser o modelo `:free` definido em `HERMES_MODELO`, pelo OpenRouter, sem modelo pago de reserva (`fallback_providers` vazio).
- Quando o limite diário do OpenRouter acaba, o Hermes deve avisar no Telegram que o limite foi atingido, em vez de ficar em silêncio.

**Sem terminal**
- Quando Davi pede para rodar um comando (por exemplo, "roda `ls /`"), o Hermes deve dizer que não tem essa ferramenta. A lista de ferramentas ativas não deve ter terminal, execução de código nem navegador.

**Backup**
- Quando o backup diário roda, ele deve copiar `/opt/asttra/hermes/dados` com a tag `hermes` e a mesma retenção. Se a pasta não existe, ele segue sem falhar, como no Paperclip.
- Os tokens e as chaves ficam só em `/opt/asttra/hermes/.env` (`chmod 600`), fora da pasta de dados e fora do Git.

## Fora de escopo
- **Aprovações (item 6b, spec 006):** a tela Aprovações do painel, o bot de aprovações, os botões Aprovar/Recusar e o registro das decisões. Neste item, o Hermes não cria pedidos `request_board_approval`.
- **Registro em `atividades` (itens 6b e 7):** o painel ainda não tem a API `/api/v1`. A auditoria deste item fica no registro do próprio Paperclip, como na spec 004.
- **Terminal e sandbox de comandos:** volta para decisão, com ADR, quando alguma tarefa precisar.
- A base de conhecimento, o Graphify, o n8n, o Gmail e a tela Assistente do painel (itens 7 a 9).
- A troca automática de modelo e o aviso de limite no painel.
- WhatsApp e voz.

## Arquivos e interfaces
- `infra/hermes/compose.yml` (novo): o serviço `hermes`, com a imagem `${HERMES_IMAGEM}`, o comando `gateway run`, `env_file: .env`, o volume `./dados:/opt/data`, a rede `asttra`, nenhuma porta, `mem_limit` de 1,5 GB (a medir), `pids_limit`, `no-new-privileges`, `healthcheck` (`/health` da API) e `restart: unless-stopped`.
- `infra/hermes/.env.example` (novo): `HERMES_IMAGEM`, `HERMES_MODELO`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USERS`, `OPENROUTER_API_KEY`, `API_SERVER_ENABLED=true`, `API_SERVER_HOST=0.0.0.0`, `API_SERVER_PORT=8642`, `API_SERVER_KEY` (`openssl rand -hex 32`), `PAPERCLIP_API_URL=http://paperclip:3100` e `PAPERCLIP_API_KEY` (gravada pelo `configurar.sh`). Os segredos ficam vazios.
- `infra/hermes/config.yaml` (novo, sem segredos): `model.provider: openrouter`, sem `fallback_providers`, ferramentas de terminal, código e navegador desligadas, `approvals.mode: manual` como defesa extra, `provider_routing.data_collection` conforme os termos escolhidos. Copiado para `dados/` pelo `configurar.sh`.
- `infra/hermes/SOUL.md` (novo): as instruções do Hermes, com a regra da confirmação, a lista de departamentos e a regra base de aprovação (de `infra/paperclip/regra-de-aprovacao.md`).
- **Ferramentas do Paperclip para o Hermes:** sem terminal, o Hermes precisa de ferramentas para chamar a API. Primeiro, conferir se o Paperclip tem um MCP oficial (`/reference/api/assistant-mcp/`) que funcione com uma chave de agente. Se não tiver, criar um servidor MCP mínimo em `infra/hermes/mcp-paperclip/`, ligado em `mcp_servers`, com só 3 ferramentas: `listar_departamentos`, `criar_tarefa(departamento, titulo, descricao)` e `ver_tarefa(id)`.
- `infra/hermes/configurar.sh` (novo, idempotente): cria o agente Hermes no Paperclip (`hermes_gateway`, sem heartbeat), cria a chave de agente, grava-a no `.env` e copia o `config.yaml` e o `SOUL.md` para `dados/`. Reaproveita `infra/paperclip/lib.sh`, inclusive a chave de board temporária revogada no fim.
- `infra/paperclip/.env.example`: se o `hermes_gateway` recusar HTTP fora do loopback, documentar o uso de `dangerouslyAllowInsecureRemoteHttp: true` no agente, aceitável porque o tráfego não sai da rede `asttra`.
- `infra/banco/backup/backup.sh`, `backup.env.example` e `restaurar.sh`: pasta `HERMES_DADOS` (padrão `/opt/asttra/hermes/dados`) com a tag `hermes`.
- `scripts/teste-hermes.sh` (novo) e `.github/workflows/hermes.yml` (novo, roda só quando `infra/hermes/**` muda). `scripts/check.sh`: ShellCheck nos scripts novos.
- `docs/00-playbook-infra.md`: capítulo "Hermes", com a criação do bot no BotFather, o ID do Telegram, a conta do OpenRouter, a escolha do modelo com os termos e a tabela de erros comuns.
- `docs/adr/0007-hermes-em-container-proprio-sem-terminal.md` (proposto): o `hermes_gateway` no lugar do `hermes_local` e o terminal desligado no lugar do `terminal.backend docker` do TRD.
- `docs/02-trd.md`, `docs/06-build-plan.md` e `CLAUDE.md`: "Hermes isolado", os dois bots e a infraestrutura do Hermes.

## Perguntas em aberto
- **Modelo e termos de dados:** qual modelo `:free` usar, e se sobra algum com `data_collection: deny`. A escolha é feita na implantação, e quem decide é o Davi.
- **Usuário sem root:** a imagem usa s6-overlay, que pode exigir root na subida. Conferir na implantação. Se não der, registrar no ADR 0007.
- **Porta do `hermes_gateway`:** a doc do Paperclip usa a 9119 (painel do Hermes) e a do Hermes usa a 8642 (API). Conferir qual delas responde `/v1/runs`.
- **Nomes das ferramentas a desligar:** conferir na versão fixada os nomes exatos dos toolsets de terminal, código e navegador.
- **MCP oficial do Paperclip:** existe e serve com uma chave de agente? Isso decide se o `mcp-paperclip` próprio é criado.

## Plano
1. **Pesquisa na versão fixada:** fixar a imagem do Hermes (a última vista é `v0.22.7`, de 2026-11-03) e o digest. Responder as perguntas da porta, dos toolsets, do usuário e do MCP oficial.
2. **ADR 0007** (`/asttra:adr`), com a aprovação do Davi.
3. **`infra/hermes/`:** compose, `.env.example`, `config.yaml` e `SOUL.md`. Testar no Windows com Docker, sem Telegram: `healthy`, nenhuma porta publicada, `/health` com a chave e 401 sem a chave.
4. **Ferramentas do Paperclip:** o MCP oficial ou o `mcp-paperclip`, com testes contra um Paperclip descartável.
5. **`configurar.sh`:** rodar duas vezes e conferir 1 agente, 1 chave e nenhum heartbeat.
6. **Backup:** `HERMES_DADOS` no `backup.sh`, no `restaurar.sh` e no `scripts/teste-banco.sh`.
7. **`scripts/teste-hermes.sh` e workflow** do CI.
8. **Playbook:** capítulo "Hermes", um bloco por vez, dizendo onde rodar (Windows/PowerShell, servidor, navegador ou celular).
9. **Implantação no servidor** pelo playbook, e depois a verificação de ponta a ponta.
10. **Docs:** marcar o 6a no Build Plan e atualizar o TRD e o `CLAUDE.md`.

**Testes previstos:**
- Unidade: se o `mcp-paperclip` for criado, as 3 ferramentas contra um Paperclip falso, incluindo departamento inexistente e Paperclip fora do ar.
- Integração: `scripts/teste-hermes.sh` sobe o banco, o Paperclip e o Hermes (sem Telegram e sem OpenRouter de verdade), depois:
  - confere que não há portas publicadas nem o socket do Docker montado, e o `/health` com 401 sem a chave;
  - roda o `configurar.sh` duas vezes;
  - confere que a configuração efetiva não tem terminal, código nem navegador;
  - chama as ferramentas do Paperclip direto e confere a tarefa criada no projeto certo.
- Backup: o `scripts/teste-banco.sh` passa a conferir o snapshot com a tag `hermes`.
- E2E: não se aplica no CI, porque depende do Telegram e do modelo. A conversa real é a verificação manual abaixo.

**Comandos de verificação:**
- `scripts/check.sh` e `scripts/teste-hermes.sh`
- No servidor: `docker compose ps` (`healthy`), `docker port hermes` (vazio), `sudo ufw status` (só OpenSSH) e `docker stats --no-stream hermes` (memória medida, para atualizar o TRD).

## Verificação de ponta a ponta
1. No celular, escrever ao bot do Hermes: "cria uma tarefa em Crescimento: preparar proposta para a empresa X". O Hermes deve responder com o que entendeu (departamento, título, descrição) e perguntar se confirma, sem criar nada ainda.
2. Responder "sim". O Hermes deve responder com o link da tarefa, e ela deve aparecer no projeto Crescimento em `agentes.asttralabs.com.br`.
3. Pedir outra tarefa e responder "não". Nada deve ser criado no Paperclip.
4. Perguntar "quais são os departamentos?". O Hermes deve responder direto, sem confirmação.
5. Pedir "roda `ls /`". O Hermes deve dizer que não tem terminal.
6. De outra conta do Telegram, escrever ao bot. Não deve haver resposta.
7. No servidor, `docker compose up -d --force-recreate`. Perguntar algo que ele guardou na memória: a resposta deve continuar certa.
8. Rodar `sudo /opt/asttra/banco/backup/backup.sh` e `restic snapshots --tag hermes`. Deve aparecer um snapshot novo.

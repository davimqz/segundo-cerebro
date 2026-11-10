# 007. Ponte do Hermes com o painel

- Risco: R2
- Origem: Build Plan, Etapa 1, item 7; Backend, "API e acesso dos agentes"; TRD, "Integrações"; CLAUDE.md, regra 6 (Auditoria)
- Status: Aprovada (2026-11-10)

## Objetivo
O Hermes já cria tarefas no Paperclip (spec 005), mas o painel não fica sabendo de nada. Este item abre a primeira porta do painel para agentes: as rotas `/api/v1`, protegidas por uma chave por agente. Além delas, entra um MCP pequeno no Hermes que usa essas rotas. Com isso, o Hermes consulta o painel (departamentos, últimas atividades e avisos abertos), e cada tarefa que ele cria fica registrada em Atividades.

**Risco R2:** permissões novas (chave de agente), migração de banco (tabela `chaves_agentes`), um segredo novo no `.env` do Hermes e um agente que grava no painel.

**Decisões do Davi (2026-11-08):**
- **Registro (1A):** toda tarefa criada pelo Hermes vira uma linha `tarefa_criada` em Atividades. O Hermes não cria avisos nem outros registros neste item.
- **Onde fica (2A):** as rotas REST ficam em `/api/v1` no painel. O MCP é um servidor pequeno em Python (só biblioteca padrão) dentro do container do Hermes, no mesmo padrão do `mcp-paperclip`. As mesmas rotas servem depois para o n8n (item 8).
- **Chave (3A):** a tabela `chaves_agentes` guarda só o hash da chave, as permissões (escopos) e a data de revogação. Um script cria a chave e a grava direto no `.env` do Hermes, sem mostrá-la na tela.
- **Consultas (4ABC):** departamentos, últimas atividades e avisos abertos.

**Decisões do Davi (2026-11-10):**
- **Quem registra (1A):** o próprio `mcp-paperclip` chama `POST /api/v1/tarefas` logo depois de criar a tarefa, sem depender de o modelo lembrar. Ele passa a receber a chave do painel.
- **Consultas fora da trilha (2A):** só as ações que gravam algo vão para Atividades; as consultas (GET) não. A regra 6 do `CLAUDE.md` e o RF03 do PRD foram ajustados para dizer isso.
- **Nomes (3A):** escopos `departamentos:ler`, `atividades:ler`, `avisos:ler` e `tarefas:registrar`; prefixo `pnl_`; ferramentas `departamentos`, `ultimas_atividades` e `avisos_abertos`.
- **ADR (4A):** criar o ADR 0009, "Chaves de agente do painel", com `/asttra:adr` na implementação.

## Critérios de aceite
**Chave de agente**
- Quando uma rota `/api/v1` é chamada sem `Authorization: Bearer <chave>`, com uma chave desconhecida ou com uma chave revogada, o painel deve responder 401 com `{ "erro": "nao_autorizado" }`, sem dizer qual foi o motivo.
- Quando a chave é válida, mas não tem o escopo da rota, o painel deve responder 403 com `{ "erro": "sem_permissao" }`.
- Quando uma chave é criada, o banco deve guardar só o SHA-256 dela, nunca a chave. A chave tem 32 bytes aleatórios, com o prefixo `pnl_`, e aparece uma única vez, na saída do comando.
- Quando `pnpm chave criar|listar|revogar` roda, o painel deve gravar `chave_criada` ou `chave_revogada` em Atividades (autor `sistema`, `alvo` = `chave:<id>`, com o agente e os escopos em `detalhes`). `listar` mostra o id, o agente, os escopos, a data de criação e a de revogação, nunca o hash.
- Quando `infra/painel/criar-chave-hermes.sh` roda no servidor, ele deve:
  - criar uma chave do agente `hermes` com os escopos `departamentos:ler`, `atividades:ler`, `avisos:ler` e `tarefas:registrar`;
  - gravá-la como `PAINEL_API_KEY` no `.env` do Hermes, mantendo o dono e o `chmod 600`, sem mostrá-la na tela nem passá-la por argumento de comando;
  - revogar as chaves antigas do agente `hermes`.
  Rodar o script de novo troca a chave.

**Rotas `/api/v1`** (rede interna `http://painel:3000`; de fora, atrás do Cloudflare Access e com a chave)
- Quando o Hermes chama `GET /api/v1/departamentos`, o painel deve devolver `[{ slug, nome, areas }]` na ordem do menu.
- Quando o Hermes chama `GET /api/v1/atividades?limite=N`, o painel deve devolver as N atividades mais novas (padrão 20, máximo 50), com `quando`, `autor` (o nome do usuário ou o id do agente), `acao`, `alvo` e `departamento`. O campo `detalhes` não sai, para não mandar ao modelo gratuito motivos de recusa nem dados futuros de clientes.
- Quando o Hermes chama `GET /api/v1/avisos`, o painel deve devolver os avisos abertos com `tipo`, `mensagem`, `origem` e `criado_em`.
- Quando o Hermes chama `POST /api/v1/tarefas` com `{ id, titulo, departamento, link }`, o painel deve gravar em Atividades:
  - `acao` = `tarefa_criada`, `autor_tipo` = `agente`, `autor_id` = o agente da chave (`hermes`) e `alvo` = `paperclip:<id>` (por exemplo, `paperclip:AST-12`);
  - o `departamento_id` encontrado pelo nome, sem diferenciar maiúsculas nem acentos; se o nome não existir, o campo fica vazio e a atividade é gravada assim mesmo;
  - o título e o link em `detalhes`.
  O painel responde 201. O autor sempre vem da chave, nunca do corpo do pedido.
- Quando o corpo é inválido (falta `id` ou `titulo`, `id` fora de `^[A-Za-z0-9_-]{1,64}$`, título acima de 300 caracteres, link que não começa com `http(s)://`), o painel deve responder 400 sem gravar nada.
- Quando o mesmo `id` de tarefa é enviado de novo, o painel não deve gravar uma segunda atividade e deve responder 200.
- Quando o banco cai, as rotas devem responder 503 sem detalhes do erro. As rotas nunca escrevem a chave nos logs.

**Hermes**
- Quando o Hermes sobe, a lista de ferramentas do Telegram e do `api_server` deve ter o MCP `painel` com 3 ferramentas de leitura: `departamentos`, `ultimas_atividades` e `avisos_abertos`. Nenhuma ferramenta proibida pode voltar ligada.
- Quando Davi pergunta "o que aconteceu hoje no painel?" ou "tem algum aviso?", o Hermes deve responder com os dados do painel, sem pedir confirmação, porque é só leitura.
- Quando Davi confirma uma tarefa e o `criar_tarefa` do `mcp-paperclip` a cria no Paperclip, o próprio `mcp-paperclip` deve chamar `POST /api/v1/tarefas` logo em seguida. O registro não depende de o modelo lembrar de chamar outra ferramenta.
- Quando o painel está fora do ar ou recusa a chave, a tarefa continua criada no Paperclip, e o Hermes deve responder "tarefa criada (link), mas não consegui registrar no painel". Ele não tenta criar a tarefa de novo.
- Quando `PAINEL_API_URL` ou `PAINEL_API_KEY` não estão no `.env` do Hermes, o `criar_tarefa` deve funcionar como hoje e avisar que o registro no painel não está configurado. As ferramentas do MCP `painel` devem responder que ele não está configurado.

## Fora de escopo
- O Hermes criar avisos, notas ou qualquer registro além de `tarefa_criada` (ideia 1B, registrada no Build Plan).
- O MCP rodando dentro do painel (opção 2B) e o acesso do Claude Code ao MCP do painel.
- Uma chave para o n8n (item 8): a tabela já suporta, mas a chave só é criada quando o n8n chegar.
- Uma tela de chaves no painel: neste item, as chaves são geridas só pelo comando.
- Limite de chamadas por chave e registro de "último uso".
- Registrar as consultas (GET) em Atividades: só as ações que gravam algo ficam na trilha (veja "Perguntas em aberto").
- A tela Assistente, o Graphify e o `pedir_aprovacao` no Hermes.

## Arquivos e interfaces
- `painel/src/core/db/schema.ts`: tabela `chaves_agentes` com `id`, `agente` (texto, ex.: `hermes`), `hash` (texto, único), `escopos` (texto[]), `criada_em` e `revogada_em` (vazio = ativa). Migração nova via `pnpm --dir painel db:gerar`. Um `check` restringe os escopos à lista conhecida.
- `painel/src/core/agentes/chaves.ts` (novo): `ESCOPOS`, `criarChave(agente, escopos)` (devolve a chave uma única vez), `listarChaves()`, `revogarChave(id)` e `revogarChavesDe(agente)`. Cada uma grava a atividade na mesma transação. Também tem `autenticar(request, escopo)`, que devolve `{ agente }` ou uma `Response` 401/403 e compara pelo hash.
- `painel/src/core/agentes/tarefas.ts` (novo): `registrarTarefaCriada(agente, dados)`, com validação zod, busca do departamento pelo nome normalizado e controle de repetição (procura `tarefa_criada` com o mesmo `alvo` sob um advisory lock).
- `painel/src/app/api/v1/departamentos/route.ts`, `atividades/route.ts`, `avisos/route.ts` e `tarefas/route.ts` (novos): rotas finas que chamam `autenticar` e os serviços já existentes (`listarDepartamentos`, `abertos` e uma variante enxuta de `listar` das atividades, sem `detalhes`). Todas com `dynamic = "force-dynamic"` e `Cache-Control: no-store`.
- `painel/scripts/chave.ts` (novo) e um `"chave"` em `package.json`, empacotado por `empacotar.mjs` para rodar no container como `node servidor/dist-scripts/chave.mjs`. `criar` escreve só a chave na saída padrão; os avisos vão para a saída de erro.
- `infra/painel/criar-chave-hermes.sh` (novo): roda `chave.mjs criar hermes ...` com `docker compose exec -T painel`, guarda a saída numa variável e reescreve o `.env` do Hermes no lugar (o mesmo padrão do `criar-chave-paperclip.sh`). As chaves antigas são revogadas só depois que a nova foi gravada.
- `infra/hermes/mcp-painel/servidor.py` e `test_servidor.py` (novos): MCP por stdio com `departamentos`, `ultimas_atividades(limite)` e `avisos_abertos`, usando `PAINEL_API_URL` (só http/https) e `PAINEL_API_KEY`.
- `infra/hermes/mcp-paperclip/servidor.py` e o teste dele: depois de criar a tarefa, chamam `POST {PAINEL_API_URL}/api/v1/tarefas`. Uma falha nessa chamada não vira erro da ferramenta e aparece no texto da resposta.
- `infra/hermes/config.yaml`: `mcp_servers.painel` e a env do painel no `mcp_servers.paperclip`; `painel` entra em `platform_toolsets` do `telegram` e do `api_server`.
- `infra/hermes/compose.yml`: monta `./mcp-painel` só para leitura. `infra/hermes/.env.example`: `PAINEL_API_URL=http://painel:3000` e `PAINEL_API_KEY=` (gravada pelo script).
- `infra/hermes/SOUL.md`: uma linha dizendo que consultas ao painel não pedem confirmação.
- `scripts/check.sh`: roda também os testes de unidade do `mcp-painel`. `scripts/teste-hermes.sh`: confere que o MCP `painel` aparece ligado e que as ferramentas proibidas continuam fora.
- Documentos: `docs/05-backend-schema.md` (tabela, rotas e as ações `tarefa_criada`, `chave_criada` e `chave_revogada`), `docs/02-trd.md` (Integrações), `docs/00-playbook-infra.md` (capítulo "Ponte do Hermes"), `docs/06-build-plan.md` e `CLAUDE.md`.

## Perguntas em aberto
Nenhuma. Todas respondidas em 2026-11-10 (veja "Decisões do Davi").

## Plano
1. Branch `feat/007-ponte-hermes-painel` a partir da `main` atualizada.
2. Schema: tabela `chaves_agentes` + `pnpm --dir painel db:gerar`; confere a migração gerada.
3. `core/agentes/chaves.ts` com testes de unidade (formato da chave, hash, escopos) e de integração (criar, listar, revogar, atividades gravadas).
4. `scripts/chave.ts` + `empacotar.mjs` + entrada em `package.json`.
5. `core/agentes/tarefas.ts` e as 4 rotas `/api/v1`, com testes de integração.
6. `infra/hermes/mcp-painel/` com testes de unidade (painel falso por `http.server`, como no `mcp-paperclip`).
7. Mudança no `mcp-paperclip` (registro depois de criar) e nos testes dele.
8. `config.yaml`, `compose.yml`, `.env.example`, `SOUL.md`, `check.sh` e `teste-hermes.sh`.
9. `infra/painel/criar-chave-hermes.sh` (ShellCheck).
10. Documentos e ADR 0009.
11. `/asttra:concluir`: checagem, revisor e PR (R2: entra só com a aprovação do Davi).
12. Implantação no servidor, seguindo o novo capítulo do playbook: atualizar o painel (migração na subida), rodar `criar-chave-hermes.sh`, copiar `infra/hermes/` e recriar o Hermes.

**Testes previstos:**
- Unidade (vitest): geração e hash da chave; checagem de escopos; validação do corpo de `POST /tarefas`; normalização do nome do departamento.
- Unidade (Python, no `check.sh`): `mcp-painel` lista as 3 ferramentas, formata as respostas, trata 401/503/sem rede e recusa URL que não é http(s); `mcp-paperclip` chama o painel depois de criar a tarefa, segue quando o painel falha e não chama quando não está configurado.
- Integração (`scripts/teste-painel.sh`, PostgreSQL descartável): para cada rota, sem chave (401), com chave revogada (401), sem escopo (403) e com escopo (200/201); `tarefa_criada` gravada com autor `agente`/`hermes` e o departamento certo; repetição não duplica; corpo inválido não grava; departamento desconhecido grava sem `departamento_id`; `chave_criada` e `chave_revogada` em Atividades; o hash nunca aparece em `listar`.
- Integração (`scripts/teste-hermes.sh`): MCP `painel` ligado no Telegram e no `api_server`, e as ferramentas proibidas fora.
- E2E: não se aplica; a interface não muda. A tela Atividades já mostra as novas ações.

**Comandos de verificação:**
- `scripts/check.sh`
- `scripts/teste-painel.sh`
- `scripts/teste-hermes.sh`
- `shellcheck infra/painel/criar-chave-hermes.sh`

## Verificação de ponta a ponta
No servidor, depois da implantação:
1. `sudo /opt/asttra/painel/criar-chave-hermes.sh`: termina sem mostrar a chave; `sudo grep -c PAINEL_API_KEY /opt/asttra/hermes/.env` dá 1; Atividades mostra `chave_criada`.
2. `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18000/api/v1/avisos` dá `401`.
3. No Telegram, pedir ao Hermes "tem algum aviso aberto no painel?": ele responde com a lista (ou "nenhum") sem pedir confirmação.
4. No Telegram, pedir uma tarefa de teste, conferir o que o Hermes entendeu e responder "sim": a tarefa aparece no Paperclip, e em Atividades aparece `tarefa_criada`, autor `hermes`, com o departamento certo e o alvo `paperclip:AST-N`. **É o "Pronto quando" do item 7.**
5. Pedir "o que aconteceu hoje no painel?": a resposta cita a `tarefa_criada` do passo 4.
6. `sudo docker compose logs hermes painel | grep -c pnl_` dá 0.

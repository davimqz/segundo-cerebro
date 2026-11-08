# 006. Aprovações no painel e no Telegram

- Risco: R2
- Origem: Build Plan, Etapa 1, item 6b; PRD, RF02 e "Regra base de aprovação"; TRD, "Integrações" (dois bots) e "Dados"; App Flow, "Fluxo de aprovação" e "Aprovar pelo celular"
- Status: Implementada (falta a implantação, passos 80 a 87 do playbook)

## Objetivo
Os pedidos de aprovação dos agentes ficam no Paperclip (TRD, "Dados"). Este item faz Davi decidir esses pedidos em dois lugares: na tela Aprovações do painel e num segundo bot do Telegram, o bot de aprovações. A primeira decisão vale, e o outro lugar mostra quem decidiu. Toda decisão fica em `atividades`. O poder de aprovar fica no painel; o Hermes não ganha esse poder.

**Risco R2:** o item mexe com permissões (o poder de aprovar no Paperclip), traz dois segredos novos (uma chave de board e o token do bot), uma integração externa (Telegram), um container novo e uma migração de banco.

**Decisões do Davi (2026-11-08):**
- **Bot em container próprio (1A):** um segundo serviço no `infra/painel/compose.yml`, feito com a mesma imagem do painel, roda só o bot. Ele busca as mensagens do Telegram por long polling, sem webhook e sem porta publicada, e confere o Paperclip a cada ~10 segundos.
- **Chave de board permanente (2A):** o painel guarda no `.env` uma chave de board do Paperclip, criada sem validade (o padrão do Paperclip é 30 dias). Ela é criada uma vez pelo link de aprovação do Paperclip, como no `configurar.sh`. Se a chave falhar, o painel mostra um aviso.
- **Botões (3A):** só Aprovar e Recusar. "Editar" (o "pedir revisão" do Paperclip) vai para Ideias.
- **Motivo obrigatório ao recusar (4A).**
- **Pedidos de teste (5A):** neste item, só o script de teste cria pedidos. A ferramenta `pedir_aprovacao` do Hermes vai para Ideias.
- **Tela (6A):** os pendentes no topo e, embaixo, os 20 últimos decididos, com quem decidiu, onde e quando. A tela se atualiza sozinha.

**Comportamento do Paperclip `2026.1023.0` (conferido no código):**
- Rotas: `GET /api/companies/{id}/approvals?status=`, `GET /api/approvals/{id}`, e `POST /api/approvals/{id}/approve` e `/reject`, com `{ decisionNote }`. Só quem tem acesso de board decide.
- Um pedido decidido não aceita a decisão oposta (responde 422). Repetir a mesma decisão devolve o pedido sem mudar nada.
- `POST /api/board-api-keys` com `expiresAt: null` cria uma chave sem validade.

## Critérios de aceite
**Tela Aprovações (`/aprovacoes`)**
- Quando há pedidos pendentes no Paperclip, a tela deve listá-los, do mais antigo para o mais novo. Cada pedido mostra:
  - o tipo e o título (`payload.titulo`, ou o tipo quando não houver título);
  - a descrição (`payload.descricao`) e os outros campos do `payload` como lista de "campo: valor";
  - o agente que pediu (ou "board") e quando o pedido foi feito.
- Quando Davi clica em Aprovar, o painel deve aprovar o pedido no Paperclip e gravar `aprovacao_aprovada` em `atividades`, com `autor_tipo = usuario`, o id do usuário do painel, `alvo` igual ao id do pedido e `detalhes.origem = "painel"`.
- Quando Davi clica em Recusar, o painel deve pedir o motivo. Sem motivo, ele não envia. Com motivo, ele recusa no Paperclip com o motivo em `decisionNote` e grava `aprovacao_recusada` com o motivo em `detalhes`.
- Quando o pedido já foi decidido em outro lugar (resposta 422 ou pedido já decidido), a tela deve mostrar "Já decidido" com a decisão que valeu, sem gravar uma segunda atividade.
- Quando a tela está aberta, ela deve se atualizar sozinha a cada 10 segundos.
- Abaixo dos pendentes, a tela deve mostrar os 20 últimos pedidos decididos, com a decisão, o motivo (se houver), quando e onde (painel, Telegram ou Paperclip). O lugar vem da atividade gravada para aquele pedido.
- Quando o Paperclip não responde ou recusa a chave, a tela deve mostrar o erro no lugar da lista, e a faixa de avisos deve mostrar um aviso.
- Quando as variáveis do Paperclip não estão no `.env`, a tela deve dizer que as aprovações não estão configuradas, e o resto do painel deve funcionar normalmente.

**Bot de aprovações (Telegram)**
- Quando aparece um pedido pendente no Paperclip, o bot deve mandar uma mensagem ao Davi em até ~15 segundos. A mensagem tem o título, a descrição, quem pediu, o link do pedido no painel e os botões Aprovar e Recusar. A mensagem é mandada uma vez só, mesmo depois de reiniciar o container.
- Quando o texto passa do limite do Telegram, a mensagem deve ser cortada com "…" e o link para ver o pedido completo no painel.
- Quando Davi toca em Aprovar, o bot deve aprovar no Paperclip e gravar `aprovacao_aprovada` com `detalhes.origem = "telegram"`. Depois, ele troca a mensagem por "Aprovado no Telegram às HH:MM", sem botões.
- Quando Davi toca em Recusar, o bot deve perguntar o motivo numa mensagem de resposta. A resposta do Davi a essa mensagem vira o motivo: o bot recusa no Paperclip, grava `aprovacao_recusada` e atualiza a mensagem original.
- Quando o pedido é decidido no painel ou na tela do Paperclip, o bot deve trocar a mensagem por "Aprovado no painel às HH:MM" (ou "Recusado…", com o motivo), sem botões, em até ~15 segundos. Uma pergunta de motivo que ainda esteja aberta para esse pedido fica sem efeito.
- Quando o pedido é decidido na tela do Paperclip, o bot deve gravar a atividade com `detalhes.origem = "paperclip"`, para o histórico mostrar onde foi decidido.
- Quando o toque chega depois de o pedido já estar decidido, o bot deve responder "Já decidido no {lugar}", sem decidir de novo.
- Quando outra pessoa escreve ao bot ou toca num botão, o bot deve ignorar e não decidir nada. Só o ID numérico do Davi (`TELEGRAM_APROVACOES_CHAT_ID`) é aceito.
- Quando o Paperclip ou o Telegram ficam fora do ar, o bot deve continuar tentando, sem cair, e criar um único aviso no painel. O aviso é resolvido quando a conexão volta.

**Chave e segurança**
- Quando o script `criar-chave-paperclip.sh` roda no servidor, ele deve:
  - pedir uma chave temporária pelo link de aprovação do Paperclip;
  - criar a chave `painel-aprovacoes` sem validade;
  - gravá-la no `.env` do painel sem mostrá-la na tela;
  - revogar a chave temporária.
- Nenhum token ou chave deve aparecer em log, em `atividades` ou nas mensagens do bot.
- O container do bot não deve publicar porta e deve ter `read_only`, `no-new-privileges` e `mem_limit`.

## Fora de escopo
- O botão Editar (pedir revisão) e a edição do conteúdo antes de aprovar. Vai para Ideias.
- A ferramenta `pedir_aprovacao` no MCP do Hermes e a execução de qualquer ação depois de aprovar. Vai para Ideias, para entrar no item 9.
- Contador de pendentes na tela Início e no menu (item de Indicadores).
- Lembretes de pedidos parados e resumo diário.
- Rotas `/api/v1` e MCP do painel para aprovações (item 7).
- Aprovar pelo bot do Hermes. O Hermes continua sem poder de board.

## Arquivos e interfaces
- `painel/src/core/env.ts`: adiciona as opcionais `PAPERCLIP_URL`, `PAPERCLIP_EMPRESA_ID`, `PAPERCLIP_CHAVE_BOARD`, `TELEGRAM_APROVACOES_TOKEN` e `TELEGRAM_APROVACOES_CHAT_ID`, mais `aprovacoesConfiguradas()`.
- `painel/src/core/paperclip/cliente.ts` (novo): `listarAprovacoes(status)`, `verAprovacao(id)` e `decidir(id, "approved" | "rejected", motivo?)`. Usa `fetch` com tempo-limite e devolve `{ ok, aprovacao } | { jaDecidido, aprovacao } | { erro }`.
- `painel/src/core/aprovacoes/servico.ts` (novo): `decidirAprovacao({ id, decisao, motivo, origem, autor })`. É o único caminho de decisão, usado pela tela e pelo bot. Exige motivo para recusar, chama o cliente e grava a atividade só quando a decisão foi aplicada. Também tem `historico(20)`, que junta os pedidos decididos com o lugar gravado em `atividades`.
- `painel/src/core/aprovacoes/formatar.ts` (novo): título, campos do `payload` e o texto da mensagem do Telegram, com corte no limite e escape do HTML.
- `painel/src/core/telegram/cliente.ts` (novo): `getUpdates` (long polling), `sendMessage`, `editMessageText` e `answerCallbackQuery` com `fetch`, sem biblioteca nova.
- `painel/src/core/db/schema.ts` e uma migração nova: tabela `aprovacoes_telegram` (`aprovacao_id` texto como chave primária, `mensagem_id`, `pergunta_motivo_id` (pode ficar vazio), `status_visto`, `criado_em`, `atualizado_em`).
- `painel/scripts/bot-aprovacoes.ts` (novo) e `painel/scripts/empacotar.mjs` (incluir o bot): o laço do bot, com dois ciclos. Um busca o Telegram por long polling; o outro confere o Paperclip a cada 10 segundos. O estado fica na tabela acima.
- `painel/src/app/(painel)/aprovacoes/page.tsx`, `lista.tsx` (cliente, com atualização a cada 10 s) e `acoes.ts` (Server Actions `aprovar` e `recusar`, com sessão exigida).
- `infra/painel/compose.yml`: serviço `bot-aprovacoes` com a mesma imagem e o comando `node servidor/dist-scripts/bot-aprovacoes.mjs`, sem `ports`, `read_only`, `no-new-privileges`, `mem_limit: 256m` e a rede `asttra`.
- `infra/painel/.env.example`: as variáveis novas, sem valores.
- `infra/painel/criar-chave-paperclip.sh` (novo): reaproveita `infra/paperclip/lib.sh` (`pc_obter_chave`) e chama `POST /board-api-keys` com `expiresAt: null` e `requestedCompanyId`.
- `infra/paperclip/teste-aprovacao.sh`: o título do pedido passa a vir de `TITULO` (o padrão continua o atual), para servir ao teste deste item.
- `scripts/teste-paperclip.sh`: confere na versão fixa o contrato que o painel usa. Cria a chave sem validade, lista os pendentes, aprova, repete a aprovação (nada muda) e tenta recusar depois (422).
- Docs: playbook (novo capítulo "Aprovações"), `03-app-flow.md` (dois botões e o motivo), `02-trd.md`, `05-backend-schema.md` (tabela nova e ações em `atividades`), `06-build-plan.md` e `CLAUDE.md`.

## Perguntas em aberto
- Nenhuma de produto. Uma técnica para o revisor: se o painel estiver configurado com o Paperclip fora do ar, a tela Aprovações não pode deixar as outras telas lentas. O tempo-limite proposto para cada chamada é de 5 segundos.

## Plano
1. **ADR 0008** (`/asttra:adr`), com a aprovação do Davi: o bot de aprovações num segundo container do painel com long polling, e a chave de board permanente guardada no `.env` do painel.
2. **Contrato do Paperclip:** estender `scripts/teste-paperclip.sh` e rodar. Se a versão fixa não se comportar como descrito acima, parar e voltar ao Davi.
3. **Núcleo:** `env.ts`, `paperclip/cliente.ts`, `aprovacoes/formatar.ts` e `aprovacoes/servico.ts`, com os testes de unidade e de integração.
4. **Migração** da tabela `aprovacoes_telegram` (`pnpm --dir painel db:gerar`).
5. **Tela Aprovações:** página, lista com atualização automática, Server Actions e diálogo do motivo, no padrão Selecta e só com tokens.
6. **Bot:** `telegram/cliente.ts`, `scripts/bot-aprovacoes.ts` e a entrada no `empacotar.mjs`.
7. **Infra:** serviço no `compose.yml`, `.env.example`, `criar-chave-paperclip.sh` e a mudança no `teste-aprovacao.sh`.
8. **Docs:** playbook e os documentos listados acima.
9. `scripts/check.sh` verde e `/asttra:concluir`. O PR é R2 e só entra com a aprovação do Davi.
10. **Implantação** pelo playbook. O Davi cria o bot no `@BotFather`, roda `criar-chave-paperclip.sh` e sobe os dois serviços. Depois vem a verificação abaixo.

**Testes previstos:**
- Unidade: formatação (título, campos, corte no limite, escape), leitura do `callback_data`, a regra "recusar exige motivo" e o mapa das respostas do Paperclip (200, 422, 401, tempo esgotado).
- Integração (PostgreSQL descartável, Paperclip e Telegram falsos em servidores HTTP locais):
  - pedido novo gera uma mensagem só, mesmo depois de reiniciar o ciclo;
  - aprovar pelo botão chama o Paperclip, grava a atividade e edita a mensagem;
  - recusar pede o motivo e usa a resposta;
  - decisão feita em outro lugar edita a mensagem e anula a pergunta aberta;
  - decisão feita no Paperclip grava `origem = "paperclip"`;
  - ID de outra pessoa é ignorado;
  - Paperclip fora do ar cria um aviso só e o resolve quando volta;
  - Server Actions `aprovar` e `recusar` gravam a atividade, e um 422 não grava.
- Contrato com o Paperclip real: `scripts/teste-paperclip.sh` (passo 2).
- E2E (Playwright, com o Paperclip falso): a tela lista o pendente, aprova, exige o motivo para recusar e mostra o histórico.

**Comandos de verificação:** `scripts/check.sh`, `scripts/teste-painel.sh`, `scripts/teste-paperclip.sh` e `scripts/teste-e2e.sh`.

## Verificação de ponta a ponta
No servidor, com o painel e o bot no ar:
1. Rodar `TITULO="Teste 006 – painel" /opt/asttra/paperclip/teste-aprovacao.sh`. Em até ~15 segundos, o pedido deve aparecer na tela Aprovações e chegar no Telegram, com os dois botões.
2. Aprovar no painel. O script deve imprimir `approved`, e a mensagem no Telegram deve virar "Aprovado no painel às HH:MM", sem botões.
3. Rodar de novo com `TITULO="Teste 006 – Telegram"` e aprovar pelo botão no Telegram. O script deve imprimir `approved`, e o pedido deve sair dos pendentes do painel e ir para o histórico com "Telegram".
4. Criar um terceiro pedido, tocar em Recusar e responder com um motivo. O script deve mostrar `Status do pedido: rejected` (e sair com erro, porque ele espera `approved`), e o motivo deve aparecer no histórico e em Atividades.
5. Em Atividades, conferir as três decisões com a origem certa. Nenhuma chave ou token deve aparecer nos logs (`docker compose logs bot-aprovacoes`).
6. De outra conta do Telegram, escrever ao bot. Nada deve acontecer.

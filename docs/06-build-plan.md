# Build Plan – Segundo Cérebro da Asttra Labs

Oct 31, 2026 · @Davi Marques Oliveira

## Como o plano funciona

O segundo cérebro é construído em etapas pequenas, uma de cada vez, e cada etapa só termina quando funciona de verdade. A ordem é uma proposta para Davi aprovar.

- **Uma etapa por vez:** a próxima só começa quando a anterior está funcionando.
- **Pronto quando:** cada etapa tem um teste simples que prova que funciona.
- **Onde se constrói:** a partir da Etapa 1, no Claude Code, com os documentos (PRD, TRD, App Flow, Design Brief e Backend) como contexto.
- **Playbook:** cada etapa concluída vira um capítulo do playbook, para replicar em clientes.
- **Verticais sob demanda:** o esquema de cada vertical só é desenhado quando ela entra na fila.

## Etapa 0 – Infraestrutura

O servidor está protegido e a Cloudflare (Tunnel e Access) está no ar. Os passos estão no [playbook de infraestrutura](https://claude.ai/artifact/89NQPqbvb2mLu962mg371o).

- [x] VPS contratado, Ubuntu 26.04 atualizado
- [x] Acesso só por chave SSH, root e senha bloqueados
- [x] Firewall, Fail2ban e atualizações automáticas
- [x] Docker instalado
- [x] DNS migrado para a Cloudflare (Registro.br aponta para dell e harvey)
- [x] Confirmar ativação e testar site e e-mail
- [x] Cloudflare Tunnel no servidor
- [x] Cloudflare Access com o e-mail de Davi, lembrando o aparelho por 30 dias

O backup diário para o Cloudflare R2 foi movido para a Etapa 1, item 2, porque ainda não há dados para copiar.

**Pronto quando:** um serviço de teste abre em um subdomínio só depois do código da Cloudflare.

## Etapa 1 – Fundação do painel e dos agentes

Ao fim desta etapa, Davi conversa com o Hermes pelo Telegram, aprova ações e vê tudo registrado no painel, ainda sem as verticais.

1. [x] **Repositórios no GitHub:** o painel fica neste repositório, na pasta `painel/` ([ADR 0002](adr/0002-painel-no-repositorio-do-projeto.md)), e a base de conhecimento em `davimqz/asttra-conhecimento` (privado), com as pastas dos 5 departamentos.
   - Pronto quando: o Obsidian abre a base e sincroniza com o GitHub. Testado em 2026-11-02 com o plugin Obsidian Git.
2. [x] **Banco de dados:** PostgreSQL e Redis no servidor, um banco por serviço, com backup diário para o Cloudflare R2 (veio da Etapa 0: só agora há dados para copiar).
   - Pronto quando: os serviços conectam, cada um no seu banco, e um backup aparece no R2.
   - Spec: [001](specs/001-banco-e-backup.md). Arquivos em `infra/banco/`; passo a passo no playbook, capítulo "Banco e backup".
   - Concluído em 2026-11-03 (instalado no servidor em 2026-11-02). Conferidos: containers `healthy`, portas, isolamento dos bancos, `NOAUTH` no Redis, backup manual e pelo systemd no R2, restauração com contagens iguais, e-mail de falha do Healthchecks.io e acesso pelo DBeaver via túnel. O primeiro snapshot automático rodou em 2026-11-03 às 06:00 UTC (03:00 de Brasília).
3. [x] **Painel, núcleo:** login com e-mail e senha, menu com as 9 telas, tema Selecta claro e escuro, tabelas do núcleo, avisos e Atividades.
   - Pronto quando: Davi entra no painel pelo subdomínio e troca entre claro e escuro.
   - Spec: [002](specs/002-painel-nucleo.md). Código em `painel/`, implantação em `infra/painel/`; passo a passo no playbook, capítulo "Painel".
   - Concluído em 2026-11-02: implantado no servidor (container `healthy`, porta só em `127.0.0.1:18000`), rota no tunnel e Access em `painel.asttralabs.com.br`. Os testes do passo 53 do playbook passaram no computador e no celular.
4. [x] **Temas, parte do MVP:** carregar um design system e trocar o tema ativo.
   - Pronto quando: um `tokens.json` carregado muda as cores do painel.
   - Spec: [003](specs/003-temas-mvp.md). PRs #21 e #22.
   - Concluído em 2026-11-03: implantado no servidor e conferido por Davi em `painel.asttralabs.com.br` (lista com o Selecta ativo e padrão, tema carregado entra inativo, "Ativar" muda o fundo em todas as telas e depois de recarregar, `tema_instalado` e `tema_ativado` em Atividades, volta ao Selecta).
5. [x] **Paperclip:** instalado, com os 5 departamentos e a regra base de aprovação.
   - Pronto quando: um pedido de aprovação de teste aparece e pode ser aprovado.
   - Spec: [004](specs/004-paperclip.md). ADR [0006](adr/0006-paperclip-da-imagem-oficial-com-postgresql-externo.md). PRs #24, #25 e #26. Implantação em `infra/paperclip/`; passo a passo no playbook, capítulo "Paperclip".
   - Concluído em 2026-11-03. O que foi conferido:
     - container `healthy`, com a porta só em `127.0.0.1:18100`;
     - 330 migrações aplicadas no PostgreSQL 18;
     - Access com a policy `Só Davi` em `agentes.asttralabs.com.br`;
     - empresa "Asttra Labs" com os 5 projetos, a trava de contratação, o orçamento 0 e a regra escrita;
     - backup com a tag `paperclip` e restauração que confirma a `master.key`;
     - pedido `request_board_approval` de teste aprovado pela tela, com a chave temporária revogada;
     - dados mantidos depois de recriar o container.
6. **Hermes no Telegram:** com modelos gratuitos, execução isolada e ligado ao Paperclip. Dividido em duas partes por Davi em 2026-11-03.
   - [x] **6a. Hermes no Telegram:** container próprio sem terminal, modelo `:free` do OpenRouter, confirmação antes de agir e tarefas criadas no Paperclip pelo `hermes_gateway`.
     - Pronto quando: Davi pede uma tarefa no Telegram, o Hermes confirma o que entendeu e, depois do "sim", a tarefa aparece no Paperclip.
     - Spec: [005](specs/005-hermes-no-telegram.md). ADR [0007](adr/0007-hermes-em-container-proprio-sem-terminal.md). PRs #30, #31 e #32. Implantação em `infra/hermes/`; passo a passo no playbook, capítulo "Hermes".
     - Concluído em 2026-11-08: implantado no servidor com o modelo `nvidia/nemotron-3-ultra-550b-a55b:free` e conferido por Davi de ponta a ponta (pedido no Telegram, confirmação do Hermes e tarefa criada no Paperclip depois do "sim").
   - **6b. Aprovações no painel e no Telegram:** tela Aprovações do painel e um segundo bot, do painel, com os botões Aprovar/Recusar. O primeiro "sim" ou "não" vale, e o outro lugar mostra quem decidiu. A decisão fica registrada em Atividades. O poder de aprovar fica no painel, nunca no Hermes.
     - Pronto quando: um pedido de aprovação aparece no painel e no Telegram ao mesmo tempo; Davi aprova num deles e o outro se atualiza.
     - Spec: 006, a escrever.
7. **Ponte do Hermes com o painel (servidor MCP):** o Hermes consulta e age no painel, registrando tudo em Atividades.
   - Pronto quando: um pedido no Telegram cria um registro no painel.
8. **n8n:** instalado, com `n8n-mcp`, ligado ao Gmail, Google Agenda e Google Drive.
   - Pronto quando: o Hermes lê a agenda e prepara um rascunho de e-mail para aprovação.
9. **Graphify:** mapeando a base de conhecimento e o código do painel.
   - Pronto quando: o Hermes responde uma pergunta sobre um processo citando o documento.

## Etapa 2 – Verticais do MVP

Cada vertical começa com o desenho das suas tabelas, aprovado por Davi, e termina quando o Hermes consegue usar ela pelo Telegram. Ordem proposta:

1. **CRM:** contatos, empresas, oportunidades e funil. Inclui a entrada de leads do formulário do site pelo n8n e as skills "qualificar lead" e "follow-up".
   - Pronto quando: um lead do site aparece no CRM e Davi recebe o aviso no Telegram.
2. **Indicadores:** os 5 números da tela Início, calculados com dados reais.
   - Pronto quando: a tela Início mostra os valores sem colchetes.
3. **Projetos:** projetos de clientes e entregas, ligados ao departamento Entrega.
   - Pronto quando: um projeto criado no painel gera tarefas no Paperclip.
4. **Conteúdo:** ideias, roteiros e calendário, criado do zero.
   - Pronto quando: o Hermes gera um roteiro que Davi aprova e que fica guardado no painel.

O CRM vem primeiro porque leads são o que gera receita; Indicadores vem logo depois porque a visão geral é a prioridade número 1.

## Etapa 3 em diante

Depois do MVP, na ordem que Davi decidir:

- **Canais:** WhatsApp pela API oficial da Meta, e-mail da Hostinger e voz.
- **Redes sociais:** Instagram, X, Threads, LinkedIn, TikTok e YouTube, com publicação só após aprovação.
- **Editor de temas:** edição com prévia, checagem de contraste e exportação.
- **Gestão e BI:** indicadores por departamento.
- **Replicação:** empacotar tudo como modelo implantável no servidor de um cliente, a partir do playbook.

Ideias registradas, só quando Davi pedir: resumo diário, revisão semanal e follow-up automático de leads.

Ideias de infraestrutura (da spec 001):
- **Bucket Lock no R2:** impedir que os backups sejam apagados antes do prazo, mesmo com a chave do R2 vazada.
- **Mover o Cloudflare Tunnel** de `~/infra/cloudflared` para `/opt/asttra/`, junto com os outros serviços.

Ideias do Hermes (da spec 005), para Davi decidir:
- **Pesquisa na web:** a imagem do Hermes não tem busca gratuita embutida, e a leitura de páginas alcançaria a rede interna do Docker. A ferramenta `web` ficou desligada. Para ligar, seria preciso uma chave de busca (por exemplo, o plano gratuito do Brave Search) e um bloqueio da rede interna.
- **Terminal em sandbox:** deixar o Hermes rodar comandos num container descartável, quando alguma tarefa precisar (talvez no item 9). Exige decidir como dar acesso ao Docker sem dar poder de root (proxy do socket ou outra saída), com ADR.

Ideias do Paperclip (da spec 004), para Davi decidir:
- **Backup interno do Paperclip:** ele copia o próprio banco a cada hora para a pasta de dados, e isso também entra no restic. Pode ser desligado com `PAPERCLIP_DB_BACKUP_ENABLED=false`.
- **Fechar o cadastro:** usar `PAPERCLIP_AUTH_DISABLE_SIGN_UP=true` agora que o admin existe. Hoje só o Access impede novas contas.
- **Sugestões do revisor (PR #26):**
  - `COPY --chown=root:root` no Dockerfile;
  - base `node` fixada por digest e `cap_drop: [ALL]`;
  - URL do desafio passada por `--config -` no `lib.sh`.

## Perguntas em aberto

- [x] Ordem das etapas e verticais aprovada por Davi, a princípio.
- [x] A construção segue no Claude Code assim que a Cloudflare ativar o domínio.

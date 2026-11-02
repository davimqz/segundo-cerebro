# Segundo Cérebro da Asttra Labs

Este arquivo é lido automaticamente pelo Claude Code em toda sessão. Mantenha-o curto e atualizado.
Os detalhes ficam em `docs/`. Leia o documento da etapa antes de começar a trabalhar nela.

## O que é

É um painel e um conjunto de agentes de IA para operar a Asttra Labs. A Asttra é uma consultoria de
automação com IA para PMEs, com sede em Curitiba, e Davi a opera sozinho.
- **Princípio:** os agentes executam e o Davi decide.
- **Replicável:** tudo é documentado para que a mesma estrutura seja vendida como serviço a clientes.

## Como trabalhar comigo (Davi)

- **Idioma e linguagem:** português do Brasil, simples e direto. Explique termos técnicos em uma frase.
- **Pergunte antes de decidir.** Isso vale para escolhas de produto, de stack, de nomes ou de escopo.
  Não acrescente recursos que eu não pedi; registre a ideia em "Ideias" no Build Plan.
- **Uma etapa por vez.** Trabalhe na ordem do `docs/06-build-plan.md`. Cada etapa só termina quando o teste "Pronto quando" passar.
- **Comandos no servidor:** diga sempre onde rodar cada um (no meu Windows/PowerShell ou no servidor), um bloco por vez.
- **Sem dependências de projetos antigos:** nada de reaproveitar o buildbydavi Studio ou o Trilha CRM. Tudo é construído do zero.

## Regras que não podem ser quebradas

1. **Aprovação humana.** Nenhum agente envia nada para fora, publica, gasta dinheiro, aceita termos ou apaga dados sem aprovação do Davi.
   Sozinho, um agente pode ler, pesquisar, resumir, organizar, criar tarefas internas e preparar rascunhos.
2. **Segredos.** Senhas, tokens e chaves ficam só em arquivos `.env` fora do Git (com `.env.example` versionado).
   Nunca vão em código, docs, base de conhecimento, commits ou mensagens. Nunca peça a senha root.
3. **Rede.**
   - Containers publicam portas só em `127.0.0.1`, porque o Docker ignora o UFW.
   - Todo acesso web passa pelo Cloudflare Tunnel e pelo Cloudflare Access.
   - Não abra portas no firewall além do SSH.
4. **Custo.** O teto é de R$ 100 por mês no total. Use modelos de IA gratuitos (OpenRouter) e planos gratuitos. Qualquer custo novo precisa da minha aprovação.
5. **Licenças.** Use só componentes cuja licença permita implantar no servidor de um cliente.
6. **Auditoria.**
   - Toda ação de agente é registrada na tabela `atividades`, que é append-only.
   - Agentes nunca acessam o banco direto: usam a API `/api/v1` ou o MCP do painel.

## Infraestrutura (Etapa 0, concluída)

- **Servidor:** VPS Hostinger KVM 2 com 2 vCPU, 8 GB de RAM e 100 GB NVMe, localizado no Brasil. Sistema Ubuntu 26.04 LTS.
- **Acesso:** usuário `davi` com sudo, entrando só por chave SSH ed25519. Login root e login por senha estão bloqueados.
- **Proteção do servidor:**
  - UFW liberando só o OpenSSH.
  - Fail2ban no SSH: 5 tentativas em 10 min geram bloqueio de 1 h.
  - unattended-upgrades ligado.
- **Docker:** Docker CE e Compose plugin pelo repositório oficial. Logs limitados a 10 MB com 3 arquivos. O usuário davi está no grupo docker.
- **Domínio:** `asttralabs.com.br` (Registro.br), com DNS na Cloudflare (dell e harvey).
  - O site fica na Vercel e o e-mail na Hostinger.
  - Os registros existentes ficam em "DNS only". Não mexa neles.
- **Cloudflare:** Tunnel `vps-asttra` rodando em Docker e Access com código por e-mail, lembrando o aparelho por 30 dias. Testado em `teste.asttralabs.com.br`.
- **Backup:** diário no Cloudflare R2, guardando 7 cópias diárias e 4 semanais, com teste de restauração mensal. Foi movido para a Etapa 1, item 2, junto com o PostgreSQL, porque ainda não há dados para copiar.
- **Subdomínios propostos:** `painel.`, `agentes.` (Paperclip) e `automacoes.` (n8n).
- O IP do servidor não fica neste repositório. Peça ao Davi ou use o alias do `~/.ssh/config`.

## Stack decidida

| Camada | Escolha |
| --- | --- |
| Orquestrador | Hermes Agent (Nous Research, MIT), com Telegram primeiro e modelos gratuitos via OpenRouter |
| Governança | Paperclip (MIT) com `hermes-paperclip-adapter`: organograma, tarefas, aprovações e auditoria |
| Automação | n8n + `n8n-mcp` + `n8n-skills` |
| Painel | Next.js + TypeScript + PostgreSQL + Drizzle + Redis, com shadcn/ui e ícones Lucide |
| Banco | Uma instância PostgreSQL com um banco por serviço: `painel`, `n8n` e `paperclip` |
| Conhecimento | Markdown + Git no repositório `davimqz/asttra-conhecimento`, lido no Obsidian (plugin Obsidian Git) e mapeado pelo Graphify |
| Login | Duas camadas: primeiro o Cloudflare Access, depois o login próprio do painel com e-mail e senha |

**Agentes:** há um único agente permanente, o Hermes. Os 5 departamentos são papéis no Paperclip.
A especialização vem de skills carregadas sob demanda.

**Departamentos:**
- 01 Crescimento
- 02 Entrega
- 03 Clientes
- 04 Administração
- 05 Direção

Não use "Sustentação" como nome de departamento: é o nome do contrato mensal que a Asttra vende.

## Stack e comandos

- Stack: TypeScript + Next.js + PostgreSQL (ver "Stack decidida"). O app fica na pasta `painel/` deste repositório (ADR 0002) e ainda não foi criado.
- Nada específico da Asttra (nome, domínio, e-mails, departamentos) fica fixo no código: vem de `.env` ou do banco, para a estrutura poder ser replicada.
- Instalar: a definir
- Rodar localmente: a definir
- Checagem completa (lint, tipos e testes rápidos): `scripts/check.sh` (ainda sem checagem configurada)
- Testes de integração/E2E: a definir

## Design

- O design system é o Selecta: monocromático, linhas de 1px, cantos de 0 (2px só em botões, campos e tags), fontes Geist e IBM Plex Mono em caixa alta para rótulos.
- Cores extras aparecem só em status e tags de departamento, sempre acompanhadas de texto.
- **Modos claro e escuro:**
  - O modo segue o sistema e tem um botão para trocar.
  - As telas usam só tokens semânticos (variáveis CSS), nunca valores fixos.
  - Os temas ficam no banco: o MVP carrega e troca temas; o editor de temas vem depois.
- **Valores:** os tokens e as cores com contraste medido estão em `docs/04-design-brief.md`.
  - Mockup aprovado da tela Início: `docs/design/inicio-mockup.dc.html`.
  - Design system completo: https://claude.ai/artifact/276HNJcoHeon8GKvw693EL

## Documentos (em `docs/`)

| Arquivo | Conteúdo |
| --- | --- |
| `00-playbook-infra.md` | Passo a passo do servidor já executado e os erros comuns |
| `01-prd.md` | O que o produto faz, departamentos, escopo por fase e requisitos |
| `02-trd.md` | Arquitetura, componentes, rede, dados, integrações e decisão do CRM |
| `03-app-flow.md` | As 9 telas, o fluxo de aprovação, o Telegram, o lead e os temas |
| `04-design-brief.md` | Tokens, cores, tipografia e componentes |
| `05-backend-schema.md` | Organização do código, tabelas do núcleo e API/MCP |
| `06-build-plan.md` | Etapas, ordem e critério de pronto. **Comece por aqui.** |

As versões originais são editáveis no Claude e podem ficar desatualizadas. **A fonte da verdade passa a ser este repositório.**
Quando uma decisão mudar, atualize o doc correspondente e este arquivo no mesmo commit.

## Engenharia

- O processo de desenvolvimento vem do plugin `asttra`, no repositório `davimqz/asttra-engenharia`. O plugin traz:
  - a matriz de risco R0/R1/R2;
  - a Definition of Done;
  - as skills, o revisor e os hooks.
- Perfil de stack: `perfis/typescript-next.md`.
- **Fluxo:**
  1. Classificar o risco.
  2. R1 e R2: `/asttra:feature` gera spec e plano.
  3. Implementar com testes, numa sessão limpa.
  4. `/asttra:concluir` roda checagem, revisor e PR.
  5. PR R2 só entra com aprovação do Davi.
- **Onde registrar:** specs em `docs/specs/`; decisões técnicas novas em `docs/adr/`. O PRD e o TRD continuam sendo a fonte dos requisitos.
- **Git:** branch por tarefa e PR para `main`. Conventional Commits em português.
## Próximo passo

1. Começar a Etapa 1, item 2: PostgreSQL e Redis no servidor, um banco por serviço, com backup diário para o Cloudflare R2.

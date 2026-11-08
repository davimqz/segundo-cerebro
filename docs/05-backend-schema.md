# Backend e Schema – Segundo Cérebro da Asttra Labs

Oct 31, 2026 · @Davi Marques Oliveira

## Abordagem

Decisão de Davi em 31/10/2026: este documento define só o núcleo do painel. Cada vertical (CRM, projetos, conteúdo, indicadores) ganha seu próprio esquema quando entrar no plano de desenvolvimento.

O núcleo é o que todas as verticais usam: departamentos, temas, registro de atividades, avisos e conexões com serviços externos. Tarefas e aprovações não têm tabela aqui, porque já vivem no Paperclip.

Stack proposta, por ser a que Davi já domina: Next.js com TypeScript, PostgreSQL e Drizzle para tabelas e migrações.

## Organização do código

O painel é um monólito modular: um único app, dividido em módulos que só conversam pelos serviços uns dos outros. Assim uma vertical nova entra sem mexer nas outras.

```
src/
  core/          banco, autenticação, temas, auditoria, avisos, integrações
  modules/
    crm/         vertical futura
    projetos/    vertical futura
    conteudo/    vertical futura
    indicadores/ vertical futura
  app/           telas (Next.js)
  api/           rotas usadas pelos agentes
```

Cada módulo tem as próprias tabelas, as regras num arquivo de serviço e registra suas ações na auditoria do núcleo.

## Tabelas do núcleo

Seis tabelas sustentam o painel desde o primeiro dia. Os campos abaixo são os implementados na spec 002 (`painel/src/core/db/schema.ts`).

| Tabela | Guarda | Campos |
| --- | --- | --- |
| `departamentos` | Os 5 departamentos e suas áreas | id, slug (usado no token de cor `tag-<slug>`), nome, ordem, areas (JSON, lista) |
| `temas` | Design systems instalados | id, nome, tokens (JSON no formato do Selecta), ativo, padrao, criado_em. Só um ativo e só um padrão por vez |
| `atividades` | Registro de tudo o que agentes e Davi fizeram | id, quando, autor_tipo (`usuario`, `agente` ou `sistema`), autor_id, departamento_id, acao, alvo, aprovado_por, detalhes (JSON) |
| `avisos` | Avisos do sistema mostrados no topo | id, tipo (`alerta` ou `erro`), mensagem, origem, criado_em, resolvido_em, resolvido_por. Aberto é `resolvido_em` vazio |
| `integracoes` | Status das conexões externas | id, servico, status, ultima_verificacao |
| `configuracoes` | Preferências do painel | chave, valor (JSON) |

O login (Better Auth, [ADR 0004](adr/0004-login-do-painel-com-better-auth.md)) tem as próprias tabelas: `usuarios`, `sessoes`, `contas` (com o hash argon2id da senha), `verificacoes` e `limites_tentativas` (o limite de tentativas de login por IP).

Ações gravadas em `atividades` pelo núcleo: `login`, `logout`, `senha_trocada`, `usuario_criado`, `aviso_criado` e `aviso_resolvido`.

**Aprovações (spec 006).** Os pedidos continuam no Paperclip. O painel tem só a tabela `aprovacoes_telegram`, com o estado do bot de aprovações: aprovacao_id (chave), mensagem_id, pergunta_motivo_id (vazio sem pergunta aberta), status_visto, criado_em e atualizado_em. Cada decisão grava em `atividades`:
- `aprovacao_aprovada` ou `aprovacao_recusada`, com `alvo` igual ao id do pedido no Paperclip;
- `detalhes.origem`: `painel`, `telegram` ou `paperclip`, além do tipo, do título e, na recusa, do motivo;
- o autor é do tipo `usuario`: o id do usuário do painel, `telegram:<id do Telegram>` ou `paperclip:<id do usuário no Paperclip>`.

Quando o Paperclip ou o Telegram caem, o painel e o bot abrem um único aviso por serviço (origens `aprovacoes:paperclip` e `aprovacoes:telegram`) e o resolvem sozinhos quando a conexão volta.

Regras:

- `atividades` só recebe inclusões: nada é editado nem apagado, para servir de trilha de auditoria. Um gatilho no PostgreSQL recusa `UPDATE`, `DELETE` e `TRUNCATE`.
- Senhas e chaves de serviços externos não ficam no banco: ficam nos arquivos de ambiente do servidor; `integracoes` guarda só o status.
- Toda tabela de vertical terá `departamento_id`, para cada dado aparecer no departamento certo.

## API e acesso dos agentes

Agentes nunca acessam o banco diretamente: usam a API do painel, que aplica as permissões e registra cada ação em `atividades`.

- **Rotas internas** em `/api/v1/...`, acessíveis só pela rede Docker interna; de fora, passam pelo login da Cloudflare.
- **Chave por agente:** o Hermes e o n8n recebem chaves próprias, cada uma com o que pode fazer (ler, criar rascunho). Ações que saem da empresa passam pelo Paperclip para aprovação.
- **Servidor MCP do painel** (no MVP): expõe as mesmas rotas como ferramentas, para o Hermes e o Claude Code usarem sem código extra.
- **Rotas do núcleo no MVP:** consultar departamentos, registrar atividade, criar e resolver aviso, consultar tema ativo. Cada vertical acrescenta as suas.

## Verticais futuras e perguntas em aberto

Cada vertical terá o esquema definido quando entrar no plano de desenvolvimento:

- **CRM:** contatos, empresas, oportunidades e etapas do funil.
- **Projetos:** projetos de clientes e entregas.
- **Conteúdo:** ideias, roteiros e publicações nas redes.
- **Indicadores:** os números da tela Início e de cada departamento.

**Perguntas em aberto**

- [ ] Resolvido: duas camadas. Primeiro o login da Cloudflare (código por e-mail, lembrando o aparelho por 30 dias); depois o login próprio do painel, com e-mail e senha.
- [ ] Resolvido: a ponte (servidor MCP) entra no MVP, para o Hermes fazer ações no painel por Davi desde o início, sempre respeitando as regras de aprovação.

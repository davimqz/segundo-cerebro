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

Seis tabelas sustentam o painel desde o primeiro dia; os campos são uma proposta e podem mudar na construção.

| Tabela | Guarda | Campos principais |
| --- | --- | --- |
| `departamentos` | Os 5 departamentos e suas áreas | id, nome, ordem, áreas (lista) |
| `temas` | Design systems instalados | id, nome, tokens (JSON no formato do Selecta), ativo, padrão, criado em |
| `atividades` | Registro de tudo o que agentes e Davi fizeram | id, quando, autor (Davi ou agente), departamento, ação, alvo, aprovado por, detalhes (JSON) |
| `avisos` | Avisos do sistema mostrados no topo | id, tipo (alerta ou erro), mensagem, origem, aberto ou resolvido |
| `integracoes` | Status das conexões externas | id, serviço (Gmail, Telegram etc.), status, última verificação |
| `configuracoes` | Preferências do painel | chave, valor |

Regras:

- `atividades` só recebe inclusões: nada é editado nem apagado, para servir de trilha de auditoria.
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

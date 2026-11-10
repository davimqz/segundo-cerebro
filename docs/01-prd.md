# PRD – Segundo Cérebro da Asttra Labs

Oct 31, 2026 · @Davi Marques Oliveira

## Problema e objetivo

O segundo cérebro centraliza a operação da Asttra Labs num só lugar, com agentes de IA executando e Davi decidindo.

Hoje a Asttra é operada por uma pessoa. As ferramentas existem, mas não conversam: o buildbydavi Studio (conteúdo e leads do Instagram) e o Trilha CRM rodam separados, sem governança nem visão única. Processos, documentos, clientes e conversas ficam espalhados.

Objetivos:

- **Visão geral única** de todas as áreas da empresa, a prioridade número 1.
- **Agentes que executam** tarefas repetitivas, com aprovação de Davi nas decisões importantes.
- **Conversa em tempo real** com o segundo cérebro pelos canais do dia a dia (Telegram, depois WhatsApp e voz).
- **Tudo documentado e replicável**, para virar um serviço da Asttra para outras empresas.

## Princípios

1. **A IA executa, Davi decide.** Nenhum agente envia mensagem a cliente, gasta dinheiro, publica conteúdo ou apaga dados sem aprovação. Toda ação fica registrada.
2. **Peças prontas antes de código próprio.** Só se constrói o que nenhum projeto open-source maduro resolve.
3. **Replicável.** Cada passo vira playbook; a mesma estrutura deve ser implantada no servidor de um cliente.
4. **Seguro por padrão.** Nenhuma porta aberta além do SSH; acesso aos serviços só pela Cloudflare.
5. **Custo baixo.** Teto de R$ 100 por mês somando servidor e APIs, buscando sempre o menor custo-benefício.

## Usuários e canais

No MVP há um único usuário humano: Davi, dono e operador da Asttra. Os demais "usuários" são os agentes.

| Canal | Uso | Fase |
| --- | --- | --- |
| Painel web | Visão geral, aprovações, tarefas e documentos | MVP |
| Telegram | Conversar com o assistente, pedir tarefas, receber alertas e aprovar | MVP |
| Gmail | Leitura e rascunhos de e-mail; envio só com aprovação | MVP |
| Google Agenda e Drive | Compromissos e arquivos | MVP |
| Obsidian | Ler e editar a base de conhecimento | MVP |
| WhatsApp | Mesmo papel do Telegram, pela API oficial da Meta | Fase 2 |
| E-mail Hostinger | E-mail profissional da Asttra | Fase 2 |
| Voz | Falar com o assistente e ouvir respostas | Fase 2 |
| Instagram, X, Threads, LinkedIn, TikTok e YouTube | Coletar métricas, comentários e mensagens; publicar só com aprovação | Fase 2 |

## Estrutura da empresa

A Asttra é organizada em 12 áreas agrupadas em 5 categorias. Essa estrutura define as seções do painel, as pastas da base de conhecimento e o organograma dos agentes, e serve de modelo padrão para replicar em clientes.

| Departamento | Áreas | Objetivo | Trabalho no MVP | Skills iniciais |
| --- | --- | --- | --- | --- |
| 01 · Crescimento | Comercial, Marketing | Atrair, conquistar e fechar clientes | Acompanhar leads, preparar follow-ups, gerar ideias e roteiros de conteúdo | Qualificar lead, follow-up, pesquisa de tema, roteiro, legenda |
| 02 · Entrega | Produto, Tecnologia e Engenharia, Operações e Projetos | Planejar, desenvolver e entregar soluções | Organizar projetos em tarefas, acompanhar prazos, documentar decisões técnicas | Plano de projeto, relatório de status, registro de decisão |
| 03 · Clientes | Atendimento e Sucesso do Cliente | Atender, acompanhar e reter clientes | Preparar a estrutura de atendimento e onboarding para os primeiros clientes | Onboarding de cliente, resposta a dúvidas frequentes |
| 04 · Administração | Financeiro, Administrativo, Jurídico e Compliance, Recursos Humanos | Manter a empresa organizada e saudável | Lembrar vencimentos, organizar contratos e documentos, controlar custos de infraestrutura | Contas a pagar, organização de contratos |
| 05 · Direção | Estratégia e Governança, Dados e Inteligência de Negócios | Medir resultados e direcionar o negócio | Indicadores e registro de decisões estratégicas | Registro de decisão |

"Sustentação" não é usado como nome de departamento porque já nomeia o contrato mensal que a Asttra vende.

**Modelo de agentes:** um único agente permanente (Hermes) atua como orquestrador e trabalha nos 5 departamentos. Cada departamento é um papel no Paperclip, com regras de aprovação e orçamento próprios, ativado só quando há tarefa. A especialização vem de skills carregadas sob demanda, não de agentes separados; subagentes só para pesquisas grandes em paralelo. Motivo: sistemas multiagente usam cerca de 15 vezes mais tokens, sem ganho na maioria das tarefas.

**Regra base de aprovação (todos os departamentos):** sozinho, o agente pode ler, pesquisar, resumir, organizar, criar tarefas internas e preparar rascunhos. Só com aprovação de Davi: enviar algo para fora, publicar, gastar dinheiro, assinar ou aceitar termos e apagar dados.

**Fonte única de dados:** o segundo cérebro é o banco único da Asttra (leads, clientes, projetos, conteúdos, finanças). Ferramentas são interfaces sobre esses dados. Tudo é construído do zero, sem depender de sistemas anteriores; o CRM será um módulo próprio do painel (ver TRD).

**Pastas da base de conhecimento**, cada uma com processos, documentos e decisões:

```
01-crescimento/    comercial/  marketing/
02-entrega/        produto/  tecnologia/  operacoes/
03-clientes/       atendimento/
04-administracao/  financeiro/  administrativo/  juridico/  rh/
05-direcao/        estrategia/  dados/
```

## Escopo por fase

O MVP entrega a visão geral e um assistente no Telegram com aprovações; canais e inteligência extra entram depois. Esta divisão é uma proposta para validação de Davi.

1. **Fase 0 – Infraestrutura** (em andamento): servidor protegido, Docker, Cloudflare e playbook.
2. **Fase 1 – MVP**
   - Painel de visão geral com as áreas da empresa, tarefas, aprovações pendentes e indicadores básicos.
   - Base de conhecimento em Markdown + Git (processos, documentos, clientes, decisões).
   - Hermes no Telegram, com acesso à base de conhecimento e às tarefas.
   - Paperclip com o organograma inicial de agentes e as regras de aprovação.
   - n8n integrando Gmail, Google Agenda, Google Drive e Telegram ao banco único.
3. **Fase 2 – Canais e voz:** WhatsApp (API oficial), e-mail da Hostinger e interface por voz.
4. **Fase 3 – Gestão e BI:** indicadores por área com dados do CRM, financeiro e conteúdo.
5. **Fase 4 – Replicação:** empacotar a estrutura como modelo implantável no servidor de um cliente.

## Requisitos funcionais do MVP

| ID | Requisito | Componente |
| --- | --- | --- |
| RF01 | Mostrar numa tela só o estado de cada área: tarefas abertas, aprovações pendentes, leads e conteúdos recentes | Painel |
| RF02 | Listar aprovações pendentes e permitir aprovar ou recusar no painel e no Telegram | Paperclip + Telegram |
| RF03 | Registrar toda ação de agente que grava ou muda algo (consultas não) com data, autor, o que foi feito e quem aprovou | Paperclip |
| RF04 | Responder perguntas sobre processos, clientes e documentos com base na base de conhecimento, citando a fonte | Hermes |
| RF05 | Criar tarefas a partir de mensagens no Telegram e atribuí-las a um agente ou a Davi | Hermes + Paperclip |
| RF06 | Ler o Gmail, resumir o que importa e preparar rascunhos; enviar só após aprovação | n8n + Hermes |
| RF07 | Ler e criar eventos no Google Agenda, avisando Davi antes de cada compromisso | n8n |
| RF08 | Registrar leads, clientes, projetos e conteúdos no banco único do segundo cérebro, por entrada manual e por integrações | n8n |
| RF09 | Guardar processos, documentos e decisões como arquivos Markdown versionados, editáveis no Obsidian | Base de conhecimento |
| RF10 | Fora do MVP: resumo diário no Telegram, só quando Davi pedir | n8n + Hermes |

## Requisitos não funcionais

| ID | Requisito |
| --- | --- |
| RNF01 | **Segurança:** nenhum serviço exposto diretamente; acesso pela Cloudflare com login; containers escutam só em `127.0.0.1` |
| RNF02 | **Segredos:** chaves de API e senhas fora do código, em arquivos de ambiente protegidos; nunca em mensagens ou na base de conhecimento |
| RNF03 | **Custo:** até R$ 100 por mês no total; modelos de IA gratuitos no início |
| RNF04 | **Recursos:** tudo deve caber no VPS de 2 vCPU e 8 GB de RAM |
| RNF05 | **LGPD:** dados de clientes no Brasil, acesso mínimo por agente e registro de quem acessou o quê |
| RNF06 | **Backup:** cópia diária dos bancos e da base de conhecimento no Cloudflare R2, com retenção de 7 cópias diárias e 4 semanais |
| RNF07 | **Replicação:** implantação descrita em playbook e em arquivos Docker Compose, sem passos manuais não documentados |
| RNF08 | **Licenças:** usar só componentes cuja licença permita o modelo de serviço da Asttra (implantação no servidor do cliente) |

## Decisões e stack

Todas as escolhas abaixo foram aprovadas por Davi em 31/10/2026.

| Camada | Escolha | Licença | Motivo |
| --- | --- | --- | --- |
| Assistente | [Hermes Agent](https://github.com/NousResearch/hermes-agent) (hermes-agent.nousresearch.com) | MIT | Aprende com o uso; integração oficial com o Paperclip |
| Governança | [Paperclip](https://github.com/paperclipai/paperclip) | MIT | Organograma, tarefas, orçamentos, aprovações e auditoria |
| Automação | [n8n](https://github.com/n8n-io/n8n) + [n8n-mcp](https://github.com/czlonkowski/n8n-mcp) | Uso sustentável / MIT | Mais completo; o Claude constrói os fluxos; permite consultoria no servidor do cliente |
| Modelo de IA | Gratuitos via OpenRouter | — | Custo zero no início; troca para pago se precisar |
| Conhecimento | Markdown + Git, lido no Obsidian | — | Legível por pessoas e agentes, versionado |
| Arquivos e agenda | Google Drive e Google Agenda | — | Integra com o Gmail; 15 GB gratuitos bastam para documentos |
| Painel | Next.js + PostgreSQL + Drizzle | — | Stack que Davi já domina |
| Infraestrutura | VPS Hostinger KVM 2, Ubuntu 26.04, Docker, Cloudflare | — | Ver o playbook de infraestrutura |

Avaliados e não escolhidos: OpenClaw (histórico recente de falhas de segurança), NanoClaw, ZeroClaw, Khoj, Activepieces, Kestra, Windmill e 9Drive.

## Fora de escopo, riscos e perguntas em aberto

**Fora do MVP:** WhatsApp, voz, e-mail da Hostinger, BI por área, acesso de outras pessoas e replicação para clientes. Também não há ações financeiras automáticas em nenhuma fase sem aprovação.

**Riscos**

| Risco | Mitigação |
| --- | --- |
| Paperclip é jovem e tem muitas issues abertas | Usar só recursos estáveis; manter as regras de aprovação também documentadas fora dele |
| Modelos gratuitos têm limite diário e qualidade variável | Configurar um modelo pago barato como reserva |
| Skills de terceiros podem trazer código malicioso | Instalar só skills de publicadores verificados e revisadas |
| 8 GB de RAM podem ficar apertados | Medir o consumo a cada serviço novo; o Studio continua rodando na máquina local |
| Mudança de licença de algum componente | Revisar licenças antes de cada implantação em cliente |

**Perguntas em aberto para Davi**

- [ ] Resolvido: 12 áreas em 5 categorias (ver Estrutura da empresa).
- [ ] Resolvido: um agente orquestrador, 5 departamentos como papéis e skills sob demanda (ver Estrutura da empresa).
- [ ] Resolvido: indicadores iniciais são leads novos na semana, propostas em aberto, tarefas atrasadas, aprovações pendentes e conteúdos publicados; podem mudar com o uso.
- [ ] Resolvido: CRM será um módulo próprio do painel; módulo de conteúdo criado do zero em fase futura.
- [ ] Resolvido: backups no Cloudflare R2 (10 GB gratuitos), diários, guardando as últimas 7 cópias diárias e 4 semanais.

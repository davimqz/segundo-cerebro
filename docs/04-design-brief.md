# Design Brief – Segundo Cérebro da Asttra Labs

Oct 31, 2026 · @Davi Marques Oliveira

O painel usa a identidade da Asttra (design system Selecta), com cores extras só onde a informação precisa delas, modo claro e escuro, e uma camada de tema que permite trocar a identidade inteira no futuro.

## Decisões e direção visual

Decisões de Davi em 31/10/2026:

- **Base visual:** a mesma identidade da Asttra, o design system [Selecta](https://claude.ai/artifact/276HNJcoHeon8GKvw693EL).
- **Cores extras:** permitidas em tags, tabelas e status, onde a cor ajuda a ler a informação.
- **Identidade futura:** o painel deve permitir trocar para uma identidade própria sem reescrever as telas.
- **Temas:** modo claro e escuro, seguindo o sistema do computador, com botão para trocar.

**Direção:** o Selecta foi feito para uma landing page; o painel é uma ferramenta de uso diário. Por isso mantém o essencial (monocromático, linhas de 1px, cantos retos, Geist e IBM Plex Mono) e ajusta o que uma ferramenta precisa: tipografia menor e mais densa, tabelas legíveis e cor reservada para estado e categoria. Os enfeites de landing (calhas hachuradas, dot grid, ilustrações halftone) ficam fora das telas de trabalho.

## Camada de tema

As telas nunca usam valores de cor ou fonte diretamente: usam nomes de função, e um arquivo de tema diz qual valor cada nome tem. Trocar de identidade é trocar esse arquivo.

1. **Tokens de marca:** os valores brutos de uma identidade (os do Selecta hoje). Ficam num arquivo `themes/selecta.ts`.
2. **Tokens semânticos:** o que as telas usam, pela função: `surface`, `text`, `text-muted`, `border`, `status-success`, `tag-crescimento`. Cada um aponta para um token de marca, em cada modo (claro e escuro).
3. **Componentes:** botões, tabelas e tags só leem tokens semânticos.

Para criar a identidade própria do painel no futuro: um novo arquivo, por exemplo `themes/painel.ts`, com os mesmos nomes semânticos e outros valores. Nenhuma tela muda. Os dois temas podem até conviver, com troca nas Configurações.

Na prática, os tokens viram variáveis CSS (`--color-surface`) usadas pelo Tailwind e pelos componentes; a troca de claro para escuro muda os valores dessas variáveis. A mesma estrutura serve para replicar o painel com a marca de um cliente.

**Temas editáveis no painel (pedido de Davi):** os temas ficam salvos no banco do painel, não só em arquivos de código. A tela Configurações › Aparência carrega um design system no formato `tokens.json` do Selecta, permite editar cores, fontes e cantos com prévia e checagem de contraste, ativa o tema e exporta o arquivo. O Selecta vem instalado como tema padrão. No MVP: carregar e trocar temas; o editor com prévia vem numa fase seguinte.

## Cores

A base continua monocromática; cor aparece só em status e departamentos, sempre acompanhada de texto. Todos os pares abaixo passam o mínimo de 4,5:1 nos dois modos, medidos contra o fundo branco (`#ffffff`) e o fundo escuro (`#0a0a0a`). O modo escuro e as cores extras são propostas, já que o Selecta só tem modo claro.

**Base (Selecta)**

| Token semântico | Claro | Escuro (proposta) | Uso |
| --- | --- | --- | --- |
| `surface` | `#ffffff` | `#0a0a0a` | Fundo das telas |
| `surface-subtle` | `#fafafa` | `#141414` | Barra lateral, linhas alternadas de tabela |
| `text` | `#0a0a0a` | `#fafafa` | Texto principal (19,8:1 e 19:1) |
| `text-muted` | `#737373` | `#a3a3a3` | Texto secundário (4,7:1 e 7,8:1) |
| `border` | `#e5e5e5` | `#262626` | Linhas de 1px entre blocos |
| `border-strong` | `#d4d4d4` | `#404040` | Bordas de campos e botões |

O `ink-muted` do Selecta (`#a3a3a3`, 2,5:1 no claro) fica restrito a títulos grandes, como no site.

**Status (proposta)**

| Token | Claro | Escuro | Contraste claro / escuro | Uso |
| --- | --- | --- | --- | --- |
| `status-success` | `#15803d` | `#4ade80` | 5,0:1 / 11,4:1 | Aprovado, concluído |
| `status-warning` | `#a16207` | `#facc15` | 4,9:1 / 12,9:1 | Pendente, perto do prazo, limite da IA |
| `status-danger` | `#b91c1c` | `#f87171` | 6,5:1 / 7,2:1 | Recusado, atrasado, erro |
| `status-info` | `#1d4ed8` | `#60a5fa` | 6,7:1 / 7,8:1 | Informativo, em andamento |

**Departamentos (proposta)**

| Token | Claro | Escuro | Contraste claro / escuro |
| --- | --- | --- | --- |
| `tag-crescimento` | `#1d4ed8` | `#93c5fd` | 6,7:1 / 11:1 |
| `tag-entrega` | `#6d28d9` | `#c4b5fd` | 7,1:1 / 10,7:1 |
| `tag-clientes` | `#0f766e` | `#5eead4` | 5,5:1 / 13,4:1 |
| `tag-administracao` | `#b45309` | `#fcd34d` | 5:1 / 13,7:1 |
| `tag-direcao` | `#404040` | `#d4d4d4` | 10,4:1 / 13,4:1 |

Regra: cor nunca é a única pista. Toda tag tem o nome escrito, e todo status tem ícone ou palavra, para quem não distingue cores.

## Tipografia, espaçamento e formas

As fontes são as do Selecta; os tamanhos diminuem porque o painel mostra muita informação por tela.

| Estilo | Fonte | Tamanho / peso | Uso |
| --- | --- | --- | --- |
| `page-title` | Geist | 24px / 500, tracking −0,03em | Título de cada tela, em duas partes como no Selecta |
| `section` | Geist | 16px / 500 | Títulos de bloco e de card |
| `body` | Geist | 14px / 400 | Texto e células de tabela |
| `small` | Geist | 13px / 400 | Datas, metadados, ajuda |
| `metric` | Geist | 28px / 500, números tabulares | Valor dos indicadores |
| `label` | IBM Plex Mono | 11px / 500, caixa alta, tracking 0,12em | Tags, cabeçalhos de tabela, rótulos curtos |

- **Espaçamento:** escala do Selecta de 4 em 4px (`space-1` a `space-6`); `space-7` em diante só entre seções grandes.
- **Cantos:** 0 em cards, painéis e tabelas; 2px em botões, campos e tags.
- **Profundidade:** plana, sem sombras, exceto menus suspensos e janelas sobrepostas, que precisam se destacar do fundo.
- **Layout:** barra lateral fixa à esquerda com os 3 grupos de telas; conteúdo com largura máxima de 1280px; no celular, a barra vira menu.

## Componentes do painel

Os componentes partem do [shadcn/ui](https://ui.shadcn.com) (componentes prontos e abertos, que ficam no código do painel), restilizados com os tokens semânticos.

| Componente | Como fica |
| --- | --- |
| **Tabela** | Cabeçalho em `label` (mono, caixa alta), linhas separadas por `border` de 1px, linha alternada em `surface-subtle`, números alinhados à direita, paginação no rodapé |
| **Tag de departamento** | Texto em `label` na cor do departamento, fundo da mesma cor com 10% de opacidade, borda 1px, canto 2px |
| **Status** | Ponto colorido + palavra ("Pendente", "Aprovado"), nunca só a cor |
| **Card de indicador** | Sem fundo nem sombra, contornado por linhas de 1px; rótulo em `label`, valor em `metric`, variação em `small` |
| **Item de aprovação** | Tipo, o que o agente quer fazer, prévia do conteúdo, quem pediu e duas ações: Aprovar (botão primário) e Recusar, que abre o campo do motivo (spec 006; Editar ficou para depois) |
| **Funil do CRM** | Colunas por etapa, cards arrastáveis com nome, empresa e valor |
| **Aviso do sistema** | Faixa no topo da tela com `status-warning` ou `status-danger` (ex.: limite diário da IA atingido) |
| **Botões** | Primário em `text` sobre `surface` invertido (preto no claro, branco no escuro); secundário com borda 1px |

Ícones: [Lucide](https://lucide.dev), traço fino, sempre monocromáticos.

## Perguntas em aberto

- [x] Cores de status e departamentos aprovadas por Davi.
- [x] Mockup da tela Início, claro e escuro: aprovado.

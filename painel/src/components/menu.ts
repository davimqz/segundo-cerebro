// As 9 telas do MVP nos 3 grupos do App Flow (docs/03-app-flow.md).
// "etapa" diz quando a tela ganha conteúdo de verdade (docs/06-build-plan.md).

export type Tela = { href: string; nome: string; etapa?: string };
export type GrupoDoMenu = { nome: string; telas: Tela[] };

export const MENU: GrupoDoMenu[] = [
  {
    nome: "Decidir",
    telas: [
      { href: "/", nome: "Início" },
      { href: "/aprovacoes", nome: "Aprovações" },
      { href: "/tarefas", nome: "Tarefas", etapa: "Etapa 1, item 5" },
    ],
  },
  {
    nome: "Operar",
    telas: [
      { href: "/departamentos", nome: "Departamentos", etapa: "Etapa 2, item 2" },
      { href: "/crm", nome: "CRM", etapa: "Etapa 2, item 1" },
      { href: "/conhecimento", nome: "Conhecimento", etapa: "Etapa 1, item 9" },
      { href: "/assistente", nome: "Assistente", etapa: "Etapa 1, item 7" },
    ],
  },
  {
    nome: "Sistema",
    telas: [
      { href: "/atividades", nome: "Atividades" },
      { href: "/configuracoes", nome: "Configurações" },
    ],
  },
];

export function tela(href: string): Tela {
  const t = MENU.flatMap((g) => g.telas).find((x) => x.href === href);
  if (!t) throw new Error(`Tela fora do menu: ${href}`);
  return t;
}

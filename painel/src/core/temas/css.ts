import type { ModoDoTema, Tema } from "./schema";

/**
 * Fontes que o painel já embute (next/font, servidas pelo próprio painel). Quando o tema pede uma
 * delas, a variável da fonte embutida entra antes do nome, para não depender da fonte instalada.
 */
export const FONTES_EMBUTIDAS: Record<string, string> = {
  geist: "var(--fonte-geist)",
  "ibm plex mono": "var(--fonte-plex-mono)",
};

/** Prefixo das variáveis geradas. O Tailwind as expõe com os nomes semânticos (globals.css). */
export const PREFIXO = "--t-";

function familia(valor: string): string {
  return valor
    .split(",")
    .map((parte) => parte.trim())
    .filter(Boolean)
    .flatMap((parte) => {
      const embutida = FONTES_EMBUTIDAS[parte.replace(/^["']|["']$/g, "").toLowerCase()];
      return embutida ? [embutida, parte] : [parte];
    })
    .join(", ");
}

function coresDoModo(tema: Tema, modo: ModoDoTema): string[] {
  return tema.color.tokens.map((t) => {
    const valor = typeof t.value === "string" ? t.value : (t.value[modo] ?? t.value.light ?? Object.values(t.value)[0]);
    return `${PREFIXO}${t.name}:${valor}`;
  });
}

/** Variáveis que não mudam entre claro e escuro: fontes, cantos, espaçamentos e sombras. */
function fixas(tema: Tema): string[] {
  return [
    ...Object.entries(tema.type.families).map(([nome, valor]) => `${PREFIXO}font-${nome}:${familia(valor)}`),
    ...tema.radius.tokens.map((t) => `${PREFIXO}${t.name}:${t.value}`),
    ...(tema.spacing?.tokens ?? []).map((t) => `${PREFIXO}${t.name}:${t.value}`),
    ...(tema.shadow?.tokens ?? []).map((t) => `${PREFIXO}${t.name}:${t.value}`),
  ];
}

/**
 * Gera o CSS do tema. O modo vem do atributo `data-modo` do <html> (cookie, por aparelho):
 * "claro" e "escuro" forçam o modo; "sistema" (ou sem atributo) segue o sistema operacional.
 */
export function temaParaCss(tema: Tema): string {
  const claro = ["color-scheme:light", ...coresDoModo(tema, "light"), ...fixas(tema)].join(";");
  const escuro = ["color-scheme:dark", ...coresDoModo(tema, "dark")].join(";");
  return [
    `:root{${claro}}`,
    `:root[data-modo="escuro"]{${escuro}}`,
    `@media (prefers-color-scheme: dark){:root:not([data-modo="claro"]):not([data-modo="escuro"]){${escuro}}}`,
  ].join("\n");
}

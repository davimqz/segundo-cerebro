import { z } from "zod";

// Formato do tokens.json do design system Selecta (conferido em 2026-11-02).
// O painel aceita exatamente esse formato; o item 4 vai carregar arquivos nele.
// Campos que o painel não usa (sample, usage, fonts...) são aceitos e mantidos.

/** Modos que o painel exige em todo tema. */
export const MODOS_DO_TEMA = ["light", "dark"] as const;
export type ModoDoTema = (typeof MODOS_DO_TEMA)[number];

/** Tokens de cor que toda tela usa. Sem eles o tema é recusado. */
export const CORES_OBRIGATORIAS = [
  "surface",
  "surface-subtle",
  "text",
  "text-muted",
  "border",
  "border-strong",
  "status-success",
  "status-warning",
  "status-danger",
  "status-info",
] as const;

export const FAMILIAS_OBRIGATORIAS = ["sans", "mono"] as const;
export const CANTOS_OBRIGATORIOS = ["radius-none", "radius-xs"] as const;

// Os valores viram CSS dentro de uma tag <style>. As expressões abaixo impedem que um tema
// carregado feche a regra ou injete outra coisa (sem ; { } < > nem barra invertida) e, com
// PROIBIDO, que carregue algo de fora ou rode código (sem url(, @ nem expression(, em qualquer caixa).
const NOME = /^[a-z0-9][a-z0-9-]*$/;
const COR =
  /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color|color-mix)\([^;{}<>\\]*\)|transparent|currentColor)$/;
const MEDIDA = /^(0|-?\d+(\.\d+)?(px|rem|em|%))$/;
const LIVRE = /^[^;{}<>\\]+$/;

const PROIBIDO = /url\(|@|expression\(/i;

/** Texto que vira valor de CSS: precisa casar com a expressão e não ter nada de PROIBIDO. */
const valorCss = (expressao: RegExp, mensagem: string) =>
  z
    .string()
    .trim()
    .regex(expressao, mensagem)
    .refine((v) => !PROIBIDO.test(v), mensagem);

const cor = valorCss(COR, "cor inválida");

const tokenDeCor = z
  .object({
    name: z.string().regex(NOME, "nome de token inválido"),
    value: z.union([cor, z.record(z.string(), cor)]),
    usage: z.string().optional(),
  })
  .passthrough();

const tokenSimples = (valor: z.ZodType<string>) =>
  z
    .object({
      name: z.string().regex(NOME, "nome de token inválido"),
      value: valor,
      usage: z.string().optional(),
    })
    .passthrough();

export const esquemaDoTema = z
  .object({
    name: z.string().trim().min(1),
    version: z.number().optional(),
    color: z
      .object({
        themes: z.array(z.object({ id: z.string().regex(NOME), name: z.string() }).passthrough()).min(1),
        tokens: z.array(tokenDeCor),
      })
      .passthrough(),
    type: z
      .object({
        families: z.record(z.string().regex(NOME), valorCss(LIVRE, "família inválida")),
        groups: z.array(z.unknown()).optional(),
      })
      .passthrough(),
    spacing: z
      .object({ tokens: z.array(tokenSimples(z.string().trim().regex(MEDIDA))) })
      .passthrough()
      .optional(),
    radius: z
      .object({ tokens: z.array(tokenSimples(z.string().trim().regex(MEDIDA, "medida inválida"))) })
      .passthrough(),
    shadow: z
      .object({ tokens: z.array(tokenSimples(valorCss(LIVRE, "sombra inválida"))) })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type Tema = z.infer<typeof esquemaDoTema>;

export type ResultadoValidacao = { ok: true; tema: Tema } | { ok: false; erros: string[] };

/** Valida o formato e confere se o tema tem tudo o que o painel precisa. */
export function validarTema(entrada: unknown): ResultadoValidacao {
  const r = esquemaDoTema.safeParse(entrada);
  if (!r.success) {
    return {
      ok: false,
      erros: r.error.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`),
    };
  }
  const tema = r.data;
  const erros: string[] = [];

  const modos = new Set(tema.color.themes.map((t) => t.id));
  for (const m of MODOS_DO_TEMA) if (!modos.has(m)) erros.push(`Falta o modo obrigatório: ${m}`);

  const cores = new Map(tema.color.tokens.map((t) => [t.name, t.value]));
  for (const nome of CORES_OBRIGATORIAS) {
    const valor = cores.get(nome);
    if (valor === undefined) {
      erros.push(`Falta o token de cor obrigatório: ${nome}`);
    } else if (typeof valor !== "string") {
      for (const m of MODOS_DO_TEMA) {
        if (!valor[m]) erros.push(`Falta o valor do modo ${m} no token: ${nome}`);
      }
    }
  }

  for (const f of FAMILIAS_OBRIGATORIAS) {
    if (!tema.type.families[f]) erros.push(`Falta a família de fonte obrigatória: ${f}`);
  }

  const cantos = new Set(tema.radius.tokens.map((t) => t.name));
  for (const c of CANTOS_OBRIGATORIOS) if (!cantos.has(c)) erros.push(`Falta o token de canto obrigatório: ${c}`);

  return erros.length ? { ok: false, erros } : { ok: true, tema };
}

/** Token de cor do subtítulo que o tema pode não ter. */
export const TITULO_OPCIONAL = "title-muted";

/**
 * Tokens de cor opcionais que faltam no tema: o `title-muted` e um `tag-<slug>` por departamento.
 * Sem eles, o painel usa a cor de texto secundário. Os slugs vêm do banco, não do código.
 */
export function tokensOpcionaisFaltando(tema: Tema, slugs: readonly string[]): string[] {
  const cores = new Set(tema.color.tokens.map((t) => t.name));
  return [TITULO_OPCIONAL, ...slugs.map((s) => `tag-${s}`)].filter((nome) => !cores.has(nome));
}

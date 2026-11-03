import { describe, expect, it } from "vitest";
import selecta from "../../../seed/temas/selecta.json";
import { CORES_OBRIGATORIAS, tokensOpcionaisFaltando, validarTema, type Tema } from "./schema";

const copia = () => structuredClone(selecta) as typeof selecta;

describe("validarTema", () => {
  it("aceita o Selecta da seed", () => {
    const r = validarTema(selecta);
    expect(r.ok).toBe(true);
  });

  it("recusa tema sem um token obrigatório e diz qual falta", () => {
    const tema = copia();
    tema.color.tokens = tema.color.tokens.filter((t) => t.name !== "status-danger");
    const r = validarTema(tema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros).toContain("Falta o token de cor obrigatório: status-danger");
  });

  it("recusa token obrigatório sem o valor do modo escuro", () => {
    const tema = copia();
    const surface = tema.color.tokens.find((t) => t.name === "surface")!;
    surface.value = { light: "#ffffff" } as typeof surface.value;
    const r = validarTema(tema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros).toContain("Falta o valor do modo dark no token: surface");
  });

  it("recusa tema sem o modo escuro, sem fonte mono e sem canto de 2px", () => {
    const tema = copia() as Record<string, unknown> & typeof selecta;
    tema.color.themes = [{ id: "light", name: "Claro" }];
    tema.type.families = { sans: tema.type.families.sans } as typeof tema.type.families;
    tema.radius.tokens = tema.radius.tokens.filter((t) => t.name !== "radius-xs");
    const r = validarTema(tema);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erros).toEqual(
        expect.arrayContaining([
          "Falta o modo obrigatório: dark",
          "Falta a família de fonte obrigatória: mono",
          "Falta o token de canto obrigatório: radius-xs",
        ]),
      );
    }
  });

  it("aceita o formato da landing (tokens.json original), mas aponta os tokens do painel que faltam", () => {
    const landing = {
      name: "Selecta",
      version: 1,
      color: {
        themes: [{ id: "light", name: "Light" }],
        tokens: [
          { name: "bg", value: "#ffffff", usage: "Fundo principal." },
          { name: "ink", value: "#0a0a0a", usage: "Texto principal." },
        ],
      },
      type: {
        fonts: [],
        families: { sans: '"Geist", system-ui, sans-serif', mono: '"IBM Plex Mono", monospace' },
        groups: [],
      },
      spacing: { tokens: [{ name: "space-1", value: "4px", usage: "" }] },
      radius: { tokens: [{ name: "radius-none", value: "0", usage: "" }] },
      shadow: { tokens: [{ name: "shadow-btn", value: "0 1px 2px rgba(0,0,0,0.25)", usage: "" }] },
    };
    const r = validarTema(landing);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      for (const nome of CORES_OBRIGATORIAS) expect(r.erros).toContain(`Falta o token de cor obrigatório: ${nome}`);
      // O formato em si é aceito: os erros são só de tokens e modos que faltam.
      expect(r.erros.every((e) => e.startsWith("Falta"))).toBe(true);
    }
  });

  it("recusa valores que poderiam injetar CSS", () => {
    for (const valor of ["red;}body{display:none", "#fff</style><script>", "url(x)"]) {
      const tema = copia();
      tema.color.tokens[0].value = { light: valor, dark: "#000000" };
      expect(validarTema(tema).ok).toBe(false);
    }
    const tema = copia();
    tema.type.families.sans = "Geist; } * { color: red";
    expect(validarTema(tema).ok).toBe(false);
  });

  describe("injeção de CSS", () => {
    // Cada valor tenta fechar a regra, sair da tag <style> ou carregar algo de fora.
    const perigosos = [
      "url(https://exemplo.com/x.png)",
      "URL(x)",
      "rgb(0 0 0 / url(x))",
      "color-mix(in srgb, red, url(x))",
      "@import 'x.css'",
      "red @import",
      "expression(alert(1))",
      "rgb(expression(alert(1)))",
      "#fff}",
      "#fff{",
      "#fff;",
      "#fff</style><script>alert(1)</script>",
      "#fff>",
      "\\66 ff",
    ];

    it.each(perigosos)("recusa a cor %j", (valor) => {
      const tema = copia();
      tema.color.tokens[0].value = { light: valor, dark: "#000000" };
      expect(validarTema(tema).ok).toBe(false);
    });

    it.each(perigosos)("recusa a cor de valor único %j", (valor) => {
      const tema = copia() as unknown as { color: { tokens: { value: unknown }[] } };
      tema.color.tokens[0].value = valor;
      expect(validarTema(tema).ok).toBe(false);
    });

    it.each(perigosos)("recusa a família de fonte %j", (valor) => {
      const tema = copia();
      tema.type.families.sans = `"Geist", ${valor}`;
      expect(validarTema(tema).ok).toBe(false);
    });

    it.each(perigosos)("recusa a sombra %j", (valor) => {
      const tema = copia();
      tema.shadow.tokens[0].value = `0 1px 2px ${valor}`;
      expect(validarTema(tema).ok).toBe(false);
    });

    it("continua aceitando cores, fontes e sombras comuns", () => {
      const tema = copia();
      tema.color.tokens[0].value = { light: "oklch(0.98 0.01 90)", dark: "color-mix(in srgb, #000 90%, white)" };
      tema.type.families.sans = '"Inter Display", system-ui, sans-serif';
      tema.shadow.tokens[0].value = "0 8px 24px rgba(0, 0, 0, 0.18), 0 1px 2px hsl(0 0% 0% / 0.2)";
      expect(validarTema(tema).ok).toBe(true);
    });
  });
});

describe("tokensOpcionaisFaltando", () => {
  const slugs = ["crescimento", "entrega", "suporte-novo"];

  function valido(t: unknown): Tema {
    const r = validarTema(t);
    if (!r.ok) throw new Error(r.erros.join("; "));
    return r.tema;
  }

  it("aponta só os tags dos slugs que o tema não tem", () => {
    expect(tokensOpcionaisFaltando(valido(selecta), slugs)).toEqual(["tag-suporte-novo"]);
  });

  it("não aponta nada quando o tema tem tudo", () => {
    expect(tokensOpcionaisFaltando(valido(selecta), ["crescimento", "direcao"])).toEqual([]);
  });

  it("aponta title-muted e todos os tags num tema sem eles", () => {
    const tema = copia();
    tema.color.tokens = tema.color.tokens.filter((t) => t.name !== "title-muted" && !t.name.startsWith("tag-"));
    expect(tokensOpcionaisFaltando(valido(tema), slugs)).toEqual([
      "title-muted",
      "tag-crescimento",
      "tag-entrega",
      "tag-suporte-novo",
    ]);
  });

  it("sem departamentos, só confere o title-muted", () => {
    expect(tokensOpcionaisFaltando(valido(selecta), [])).toEqual([]);
  });
});

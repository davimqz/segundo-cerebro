import { describe, expect, it } from "vitest";
import selecta from "../../../seed/temas/selecta.json";
import { CORES_OBRIGATORIAS, validarTema } from "./schema";

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
});

import { describe, expect, it } from "vitest";
import selecta from "../../../seed/temas/selecta.json";
import { temaParaCss } from "./css";
import { validarTema, type Tema } from "./schema";

function tema(): Tema {
  const r = validarTema(selecta);
  if (!r.ok) throw new Error(r.erros.join("; "));
  return r.tema;
}

/** Extrai as declarações do bloco que começa com o seletor dado. */
function bloco(css: string, seletor: string): Record<string, string> {
  const inicio = css.indexOf(`${seletor}{`);
  expect(inicio).toBeGreaterThanOrEqual(0);
  const corpo = css.slice(inicio + seletor.length + 1, css.indexOf("}", inicio));
  return Object.fromEntries(
    corpo.split(";").map((d) => {
      const i = d.indexOf(":");
      return [d.slice(0, i), d.slice(i + 1)];
    }),
  );
}

describe("temaParaCss", () => {
  const css = temaParaCss(tema());

  it("gera as cores do modo claro no :root", () => {
    const claro = bloco(css, ":root");
    expect(claro["--t-surface"]).toBe("#ffffff");
    expect(claro["--t-text"]).toBe("#0a0a0a");
    expect(claro["--t-status-warning"]).toBe("#a16207");
    expect(claro["--t-tag-crescimento"]).toBe("#1d4ed8");
    expect(claro["color-scheme"]).toBe("light");
  });

  it("gera as cores do modo escuro para data-modo=escuro e para o sistema escuro", () => {
    const escuro = bloco(css, ':root[data-modo="escuro"]');
    expect(escuro["--t-surface"]).toBe("#0a0a0a");
    expect(escuro["--t-text"]).toBe("#fafafa");
    expect(escuro["color-scheme"]).toBe("dark");
    expect(css).toContain(
      '@media (prefers-color-scheme: dark){:root:not([data-modo="claro"]):not([data-modo="escuro"]){',
    );
  });

  it("gera fontes e cantos, usando as fontes embutidas no painel", () => {
    const claro = bloco(css, ":root");
    expect(claro["--t-font-sans"]).toBe('var(--fonte-geist), "Geist", "Inter", system-ui, sans-serif');
    expect(claro["--t-font-mono"]).toMatch(/^var\(--fonte-plex-mono\), "IBM Plex Mono"/);
    expect(claro["--t-radius-none"]).toBe("0");
    expect(claro["--t-radius-xs"]).toBe("2px");
  });

  it("usa o mesmo valor nos dois modos quando o token tem uma cor só", () => {
    const t = tema();
    t.color.tokens.push({ name: "extra", value: "#123456" });
    const saida = temaParaCss(t);
    expect(bloco(saida, ":root")["--t-extra"]).toBe("#123456");
    expect(bloco(saida, ':root[data-modo="escuro"]')["--t-extra"]).toBe("#123456");
  });
});

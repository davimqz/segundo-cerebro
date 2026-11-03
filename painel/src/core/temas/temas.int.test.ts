import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import selecta from "../../../seed/temas/selecta.json";
import { banco } from "../db/client";
import { atividades, temas } from "../db/schema";
import { ativarTema, instalarTema, listarTemas, temaAtivo, TAMANHO_MAXIMO } from "./servico";

const usuario = { id: "usuario-teste-temas" };

/** Cópia do Selecta com outro nome e, opcionalmente, outras mudanças. */
function arquivo(nome: string, mudar?: (t: typeof selecta) => void): string {
  const t = structuredClone(selecta);
  t.name = nome;
  mudar?.(t);
  return JSON.stringify(t);
}

async function contarTemas(): Promise<number> {
  return (await banco().select({ id: temas.id }).from(temas)).length;
}

async function registros(acao: string, alvo: string) {
  return banco()
    .select()
    .from(atividades)
    .where(and(eq(atividades.acao, acao), eq(atividades.alvo, alvo)));
}

async function idDoSelecta(): Promise<number> {
  const [s] = await banco().select().from(temas).where(eq(temas.padrao, true));
  return s.id;
}

/** Deixa só o Selecta ativo. */
async function voltarAoSelecta(): Promise<void> {
  const id = await idDoSelecta();
  await banco().transaction(async (tx) => {
    await tx.update(temas).set({ ativo: false }).where(eq(temas.ativo, true));
    await tx.update(temas).set({ ativo: true }).where(eq(temas.id, id));
  });
}

// Cada teste começa com o Selecta ativo.
beforeEach(voltarAoSelecta);

afterAll(async () => {
  // O banco é compartilhado com os outros arquivos: apaga os temas criados aqui.
  await voltarAoSelecta();
  await banco().delete(temas).where(eq(temas.padrao, false));
  await banco().$client.end();
});

describe("instalarTema", () => {
  it("grava o tema inativo e registra tema_instalado com o nome em alvo", async () => {
    const r = await instalarTema(arquivo("Areia"), usuario);
    expect(r).toEqual({ ok: true });

    const [linha] = await banco().select().from(temas).where(eq(temas.nome, "Areia"));
    expect(linha).toMatchObject({ ativo: false, padrao: false });
    expect((await temaAtivo()).nome).toBe("Selecta");

    const [reg] = await registros("tema_instalado", "Areia");
    expect(reg).toMatchObject({ autorTipo: "usuario", autorId: usuario.id });
    expect(reg.detalhes).toMatchObject({ id: linha.id });
  });

  it("recusa nome repetido, sem diferenciar caixa e ignorando espaços, e não grava nada", async () => {
    const antes = await contarTemas();
    for (const nome of ["  selecta ", "SELECTA", "Areia", " areia"]) {
      const r = await instalarTema(arquivo(nome), usuario);
      expect(r).toEqual({ ok: false, erros: ["Já existe um tema com esse nome"] });
    }
    expect(await contarTemas()).toBe(antes);
    expect(await registros("tema_instalado", "SELECTA")).toHaveLength(0);
  });

  it("recusa arquivo que não é JSON, grande demais ou inválido, sem gravar nada", async () => {
    const antes = await contarTemas();

    const naoJson = await instalarTema("isto não é json", usuario);
    expect(naoJson.ok).toBe(false);

    const grande = await instalarTema(" ".repeat(TAMANHO_MAXIMO + 1), usuario);
    expect(grande.ok).toBe(false);

    const semBorda = await instalarTema(
      arquivo("Sem borda", (t) => {
        t.color.tokens = t.color.tokens.filter((x) => x.name !== "border");
      }),
      usuario,
    );
    expect(semBorda).toMatchObject({
      ok: false,
      erros: expect.arrayContaining(["Falta o token de cor obrigatório: border"]),
    });

    const injecao = await instalarTema(
      arquivo("Injeção", (t) => {
        t.color.tokens[0].value = { light: "url(https://exemplo.com/x)", dark: "#000" };
      }),
      usuario,
    );
    expect(injecao.ok).toBe(false);

    expect(await contarTemas()).toBe(antes);
    expect(await registros("tema_instalado", "Sem borda")).toHaveLength(0);
  });

  it("instala sem os tokens opcionais e avisa quais faltam, usando os slugs do banco", async () => {
    const r = await instalarTema(
      arquivo("Sem tags", (t) => {
        t.color.tokens = t.color.tokens.filter((x) => x.name !== "title-muted" && x.name !== "tag-entrega");
      }),
      usuario,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos?.[0]).toContain("title-muted");
    expect(r.avisos?.[0]).toContain("tag-entrega");
    expect(r.avisos?.[0]).not.toContain("tag-crescimento");
    expect(r.avisos?.[0]).toContain("texto secundário");
  });
});

describe("listarTemas", () => {
  it("lista todos os temas com nome, data, ativo e padrão", async () => {
    const lista = await listarTemas();
    const s = lista.find((t) => t.nome === "Selecta");
    expect(s).toMatchObject({ ativo: true, padrao: true });
    expect(s?.criadoEm).toBeInstanceOf(Date);
    expect(lista.find((t) => t.nome === "Areia")).toMatchObject({ ativo: false, padrao: false });
  });
});

describe("ativarTema", () => {
  it("troca o ativo, registra tema_ativado com o anterior e temaAtivo devolve o novo", async () => {
    await instalarTema(
      arquivo("Creme", (t) => {
        const surface = t.color.tokens.find((x) => x.name === "surface")!;
        surface.value = { light: "#fff7e6", dark: "#1a1406" };
      }),
      usuario,
    );
    const [creme] = await banco().select().from(temas).where(eq(temas.nome, "Creme"));
    const selectaId = await idDoSelecta();

    expect(await ativarTema(creme.id, usuario)).toEqual({ ok: true });

    const ativos = await banco().select().from(temas).where(eq(temas.ativo, true));
    expect(ativos.map((t) => t.nome)).toEqual(["Creme"]);

    const ativo = await temaAtivo();
    expect(ativo.nome).toBe("Creme");
    const surface = ativo.tema.color.tokens.find((x) => x.name === "surface");
    expect(surface?.value).toEqual({ light: "#fff7e6", dark: "#1a1406" });

    const [reg] = await registros("tema_ativado", "Creme");
    expect(reg).toMatchObject({ autorTipo: "usuario", autorId: usuario.id });
    expect(reg.detalhes).toMatchObject({ id: creme.id, anterior: { id: selectaId, nome: "Selecta" } });
  });

  it("não muda nada quando o id não existe", async () => {
    const r = await ativarTema(999999, usuario);
    expect(r).toEqual({ ok: false, erros: ["Tema não encontrado"] });
    expect((await temaAtivo()).nome).toBe("Selecta");
  });

  it("não muda nada quando o tema está inválido no banco", async () => {
    const [quebrado] = await banco()
      .insert(temas)
      .values({ nome: "Quebrado", tokens: { name: "Quebrado" } })
      .returning();
    const r = await ativarTema(quebrado.id, usuario);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros[0]).toMatch(/inválido/);
    expect((await temaAtivo()).nome).toBe("Selecta");
    expect(await registros("tema_ativado", "Quebrado")).toHaveLength(0);
  });

  it("ativar o tema que já está ativo não grava nada", async () => {
    const id = await idDoSelecta();
    const antes = (await registros("tema_ativado", "Selecta")).length;
    expect(await ativarTema(id, usuario)).toEqual({ ok: true });
    expect(await registros("tema_ativado", "Selecta")).toHaveLength(antes);
  });
});

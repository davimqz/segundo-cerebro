import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { banco } from "@/core/db/client";
import { atividades, temas } from "@/core/db/schema";

// As ações rodam fora de um pedido do Next: o pedido é simulado sem cookie nenhum. A sessão é
// conferida de verdade pelo Better Auth, contra o banco de teste.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const { ativarTemaAcao, carregarTema } = await import("./temas-acoes");

const temaTeste = readFileSync(path.join(import.meta.dirname, "../../../../e2e/fixtures/tema-teste.json"), "utf8");

/** O redirect do Next é um erro com o destino no `digest`. */
async function destinoDoRedirect(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return String((e as { digest?: string }).digest ?? e);
  }
  return "sem redirect";
}

async function contar(acao: string): Promise<number> {
  return (await banco().select({ id: atividades.id }).from(atividades).where(eq(atividades.acao, acao))).length;
}

afterAll(async () => {
  await banco().$client.end();
});

describe("ações de tema sem sessão", () => {
  it("carregarTema recusa (vai para /entrar) e não grava nada", async () => {
    const antes = await banco().select({ id: temas.id }).from(temas);
    const registrosAntes = await contar("tema_instalado");
    const dados = new FormData();
    dados.set("arquivo", new File([temaTeste], "tokens.json", { type: "application/json" }));

    expect(await destinoDoRedirect(carregarTema(dados))).toMatch(/NEXT_REDIRECT.*\/entrar/);

    expect(await banco().select({ id: temas.id }).from(temas)).toHaveLength(antes.length);
    expect(await contar("tema_instalado")).toBe(registrosAntes);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("ativarTemaAcao recusa (vai para /entrar) e não muda o tema ativo", async () => {
    const [quieto] = await banco()
      .insert(temas)
      .values({ nome: "Sem sessão", tokens: JSON.parse(temaTeste) })
      .returning();
    const registrosAntes = await contar("tema_ativado");
    try {
      const dados = new FormData();
      dados.set("id", String(quieto.id));

      expect(await destinoDoRedirect(ativarTemaAcao(dados))).toMatch(/NEXT_REDIRECT.*\/entrar/);

      const ativos = await banco().select().from(temas).where(eq(temas.ativo, true));
      expect(ativos.map((t) => t.nome)).toEqual(["Selecta"]);
      expect(await contar("tema_ativado")).toBe(registrosAntes);
      expect(revalidatePath).not.toHaveBeenCalled();
    } finally {
      await banco().delete(temas).where(eq(temas.id, quieto.id));
    }
  });
});

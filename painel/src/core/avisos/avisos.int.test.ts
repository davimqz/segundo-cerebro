import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { listar, POR_PAGINA, registrar } from "../atividades/servico";
import { banco } from "../db/client";
import { atividades, departamentos } from "../db/schema";
import { abertos, criar, resolver } from "./servico";

afterAll(async () => {
  await banco().$client.end();
});

describe("avisos", () => {
  it("criar e resolver um aviso grava em atividades", async () => {
    const aviso = await criar("alerta", "Limite diário da IA atingido", "teste");
    expect((await abertos()).map((a) => a.id)).toContain(aviso.id);

    expect(await resolver(aviso.id, { id: "usuario-teste" })).toBe(true);
    expect((await abertos()).map((a) => a.id)).not.toContain(aviso.id);

    const registros = await banco()
      .select()
      .from(atividades)
      .where(and(eq(atividades.alvo, `aviso:${aviso.id}`)));
    expect(registros.map((r) => r.acao).sort()).toEqual(["aviso_criado", "aviso_resolvido"]);
    expect(registros.find((r) => r.acao === "aviso_resolvido")).toMatchObject({
      autorTipo: "usuario",
      autorId: "usuario-teste",
    });

    // Resolver de novo não grava outra vez.
    expect(await resolver(aviso.id, { id: "usuario-teste" })).toBe(false);
  });

  it("recusa tipo inválido e mensagem vazia", async () => {
    await expect(criar("info" as "alerta", "x", "teste")).rejects.toThrow(/Tipo/);
    await expect(criar("erro", "   ", "teste")).rejects.toThrow(/vazia/);
  });
});

describe("listar atividades", () => {
  it("lista do mais novo para o mais antigo, 50 por página, com filtros", async () => {
    const [crescimento] = await banco().select().from(departamentos).where(eq(departamentos.slug, "crescimento"));
    const acao = `teste_lista_${Date.now()}`;
    for (let i = 0; i < 60; i++) {
      await registrar({
        autorTipo: "agente",
        autorId: i % 2 ? "hermes" : "n8n",
        acao,
        alvo: `item:${i}`,
        departamentoId: i < 10 ? crescimento.id : null,
      });
    }

    const p1 = await listar({ acao }, 1);
    expect(p1.linhas).toHaveLength(POR_PAGINA);
    expect(p1.temMais).toBe(true);
    expect(p1.linhas[0].alvo).toBe("item:59");

    const p2 = await listar({ acao }, 2);
    expect(p2.linhas).toHaveLength(10);
    expect(p2.temMais).toBe(false);
    expect(p2.linhas.at(-1)?.alvo).toBe("item:0");

    expect((await listar({ acao, autor: "hermes" }, 1)).linhas).toHaveLength(30);
    const porDep = await listar({ acao, departamentoId: crescimento.id }, 1);
    expect(porDep.linhas).toHaveLength(10);
    expect(porDep.linhas[0].departamentoSlug).toBe("crescimento");
  });
});

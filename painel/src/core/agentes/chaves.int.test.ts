import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { banco } from "../db/client";
import { atividades, chavesAgentes } from "../db/schema";
import { AUTOR_CHAVES, criarChave, hashDaChave, listarChaves, revogarChave, revogarChavesDe } from "./chaves";

afterAll(async () => {
  await banco().$client.end();
});

async function atividadesDaChave(id: number) {
  return banco()
    .select()
    .from(atividades)
    .where(eq(atividades.alvo, `chave:${id}`));
}

describe("chaves de agente no banco", () => {
  it("criar guarda só o hash e grava chave_criada", async () => {
    const { id, chave } = await criarChave("agente-a", ["avisos:ler", "atividades:ler"]);
    const [linha] = await banco().select().from(chavesAgentes).where(eq(chavesAgentes.id, id));
    expect(linha.hash).toBe(hashDaChave(chave));
    expect(JSON.stringify(linha)).not.toContain(chave);
    expect(linha.escopos).toEqual(["avisos:ler", "atividades:ler"]);
    expect(linha.revogadaEm).toBeNull();

    const [registro] = await atividadesDaChave(id);
    expect(registro).toMatchObject({
      autorTipo: "sistema",
      autorId: AUTOR_CHAVES,
      acao: "chave_criada",
      detalhes: { agente: "agente-a", escopos: ["avisos:ler", "atividades:ler"] },
    });
    expect(JSON.stringify(registro)).not.toContain(chave);
  });

  it("recusa escopo desconhecido, lista vazia e nome de agente inválido", async () => {
    await expect(criarChave("agente-a", ["avisos:gravar"])).rejects.toThrow(/Escopo desconhecido/);
    await expect(criarChave("agente-a", [])).rejects.toThrow(/pelo menos um/);
    await expect(criarChave("Agente A", ["avisos:ler"])).rejects.toThrow(/agente inválido/);
  });

  it("o banco recusa escopo fora da lista mesmo sem passar pelo serviço", async () => {
    await expect(
      banco()
        .insert(chavesAgentes)
        .values({ agente: "x", hash: `h-${Date.now()}`, escopos: ["tudo:fazer" as "avisos:ler"] }),
    ).rejects.toThrow();
  });

  it("listar mostra os dados sem o hash", async () => {
    const { id } = await criarChave("agente-b", ["departamentos:ler"]);
    const item = (await listarChaves()).find((c) => c.id === id);
    expect(item).toMatchObject({ agente: "agente-b", escopos: ["departamentos:ler"], revogadaEm: null });
    expect(Object.keys(item ?? {})).not.toContain("hash");
  });

  it("revogar marca a data, grava chave_revogada e não repete", async () => {
    const { id } = await criarChave("agente-c", ["avisos:ler"]);
    expect(await revogarChave(id)).toBe(true);
    expect(await revogarChave(id)).toBe(false);
    const registros = await atividadesDaChave(id);
    expect(registros.map((r) => r.acao).sort()).toEqual(["chave_criada", "chave_revogada"]);
    expect(registros.find((r) => r.acao === "chave_revogada")?.detalhes).toEqual({
      agente: "agente-c",
      escopos: ["avisos:ler"],
    });
  });

  it("revogarChavesDe com manterUltima deixa só a mais nova ativa", async () => {
    const a = await criarChave("agente-d", ["avisos:ler"]);
    const b = await criarChave("agente-d", ["avisos:ler"]);
    const c = await criarChave("agente-d", ["avisos:ler"]);
    const outro = await criarChave("agente-e", ["avisos:ler"]);
    expect((await revogarChavesDe("agente-d", { manterUltima: true })).sort()).toEqual([a.id, b.id].sort());
    const ativas = (await listarChaves()).filter((k) => !k.revogadaEm).map((k) => k.id);
    expect(ativas).toContain(c.id);
    expect(ativas).toContain(outro.id);
    expect(ativas).not.toContain(a.id);

    expect(await revogarChavesDe("agente-d")).toEqual([c.id]);
    expect(await revogarChavesDe("agente-d")).toEqual([]);
  });
});

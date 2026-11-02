import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { banco } from "./client";
import { atividades, departamentos, temas } from "./schema";
import { semear } from "./seed";

/** Mensagem do PostgreSQL (o Drizzle embrulha o erro original em `cause`). */
async function erroDoBanco(p: PromiseLike<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const erro = e as Error & { cause?: Error };
    return erro.cause?.message ?? erro.message;
  }
  return "sem erro";
}

afterAll(async () => {
  await banco().$client.end();
});

describe("migrações e seed num banco vazio", () => {
  it("criam as tabelas do núcleo e do login", async () => {
    const r = await banco().execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    const tabelas = r.rows.map((x) => x.table_name);
    expect(tabelas).toEqual(
      expect.arrayContaining([
        "departamentos",
        "temas",
        "atividades",
        "avisos",
        "integracoes",
        "configuracoes",
        "usuarios",
        "sessoes",
        "contas",
        "verificacoes",
        "limites_tentativas",
      ]),
    );
  });

  it("instalam os 5 departamentos e o Selecta como tema ativo e padrão", async () => {
    const deps = await banco().select().from(departamentos).orderBy(departamentos.ordem);
    expect(deps.map((d) => d.nome)).toEqual(["Crescimento", "Entrega", "Clientes", "Administração", "Direção"]);

    const ts = await banco().select().from(temas);
    expect(ts).toHaveLength(1);
    expect(ts[0]).toMatchObject({ nome: "Selecta", ativo: true, padrao: true });
  });

  it("a seed pode rodar de novo sem duplicar nem sobrescrever", async () => {
    await banco().update(departamentos).set({ nome: "Vendas" }).where(eq(departamentos.slug, "crescimento"));
    await semear(banco());
    const deps = await banco().select().from(departamentos);
    expect(deps).toHaveLength(5);
    expect(deps.find((d) => d.slug === "crescimento")?.nome).toBe("Vendas");
    expect(await banco().select().from(temas)).toHaveLength(1);
    await banco().update(departamentos).set({ nome: "Crescimento" }).where(eq(departamentos.slug, "crescimento"));
  });
});

describe("gatilho de atividades (append-only)", () => {
  it("aceita inclusão e recusa UPDATE, DELETE e TRUNCATE", async () => {
    const [linha] = await banco()
      .insert(atividades)
      .values({ autorTipo: "sistema", autorId: "teste:gatilho", acao: "teste_gatilho" })
      .returning();
    expect(linha.id).toBeGreaterThan(0);

    expect(
      await erroDoBanco(banco().update(atividades).set({ acao: "alterada" }).where(eq(atividades.id, linha.id))),
    ).toMatch(/append-only: UPDATE/);
    expect(await erroDoBanco(banco().delete(atividades).where(eq(atividades.id, linha.id)))).toMatch(
      /append-only: DELETE/,
    );
    expect(await erroDoBanco(banco().execute(sql`truncate atividades`))).toMatch(/append-only: TRUNCATE/);

    const [ainda] = await banco().select().from(atividades).where(eq(atividades.id, linha.id));
    expect(ainda.acao).toBe("teste_gatilho");
  });
});

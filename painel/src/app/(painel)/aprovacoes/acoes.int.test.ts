import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { banco } from "@/core/db/client";
import { atividades } from "@/core/db/schema";
import { criarPaperclipFalso, type PaperclipFalso } from "@/test/falsos";
import { entrarECookie, usuarioNovo } from "@/test/auxiliares";

// As Server Actions rodam fora de um pedido do Next: o cookie da sessão vem de um login de verdade
// no Better Auth, contra o banco de teste. O Paperclip é o falso, num servidor HTTP local.
const cabecalhos = { cookie: "" };
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(cabecalhos.cookie ? cabecalhos : {}) }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const { aprovar, recusar } = await import("./acoes");

let pc: PaperclipFalso;
let usuarioId = "";

beforeAll(async () => {
  pc = await criarPaperclipFalso();
  process.env.PAPERCLIP_URL = pc.url;
  process.env.PAPERCLIP_EMPRESA_ID = pc.empresaId;
  process.env.PAPERCLIP_CHAVE_BOARD = pc.chave;
  const u = await usuarioNovo();
  usuarioId = u.id;
  cabecalhos.cookie = await entrarECookie(u.email);
});

afterAll(async () => {
  delete process.env.PAPERCLIP_URL;
  delete process.env.PAPERCLIP_EMPRESA_ID;
  delete process.env.PAPERCLIP_CHAVE_BOARD;
  await pc.fechar();
  await banco().$client.end();
});

async function decisoes(id: string) {
  return banco().select().from(atividades).where(eq(atividades.alvo, id));
}

/** O redirect do Next é um erro com o destino no `digest`. */
async function destinoDoRedirect(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return String((e as { digest?: string }).digest ?? e);
  }
  return "sem redirect";
}

describe("ações da tela Aprovações", () => {
  it("aprovar aprova no Paperclip e grava a atividade do usuário com origem painel", async () => {
    const p = pc.criar({ titulo: "Aprovar pelo painel" });
    const r = await aprovar(p.id);
    expect(r.tipo).toBe("ok");
    expect(pc.pedidos.get(p.id)?.status).toBe("approved");
    const registros = await decisoes(p.id);
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({
      acao: "aprovacao_aprovada",
      autorTipo: "usuario",
      autorId: usuarioId,
      alvo: p.id,
      detalhes: { origem: "painel" },
    });
    expect(JSON.stringify(registros[0])).not.toContain(pc.chave);
    expect(revalidatePath).toHaveBeenCalledWith("/aprovacoes");
  });

  it("recusar sem motivo não envia; com motivo recusa e grava o motivo", async () => {
    const p = pc.criar({ titulo: "Recusar pelo painel" });
    expect(await recusar(p.id, "   ")).toMatchObject({ tipo: "erro", mensagem: expect.stringMatching(/motivo/) });
    expect(pc.pedidos.get(p.id)?.status).toBe("pending");
    expect(pc.estado.chamadas.filter((c) => c.includes(p.id))).toHaveLength(0);

    const r = await recusar(p.id, "Fora do tom da marca");
    expect(r.tipo).toBe("ok");
    expect(pc.pedidos.get(p.id)).toMatchObject({ status: "rejected", decisionNote: "Fora do tom da marca" });
    const registros = await decisoes(p.id);
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({
      acao: "aprovacao_recusada",
      detalhes: { origem: "painel", motivo: "Fora do tom da marca" },
    });
  });

  it("pedido já decidido em outro lugar mostra Já decidido e não grava outra atividade", async () => {
    const p = pc.criar({ titulo: "Decidido no Telegram" });
    // Um 422 (decisão oposta já aplicada no Paperclip).
    pc.decidirNoPaperclip(p.id, "rejected", "não");
    const r = await aprovar(p.id);
    expect(r).toMatchObject({ tipo: "ja_decidido", mensagem: expect.stringMatching(/^Já decidido: Recusado/) });
    expect(await decisoes(p.id)).toHaveLength(0);

    const q = pc.criar({ titulo: "Mesma decisão" });
    expect((await aprovar(q.id)).tipo).toBe("ok");
    expect(await aprovar(q.id)).toMatchObject({ tipo: "ja_decidido", mensagem: expect.stringMatching(/no painel/) });
    expect(await decisoes(q.id)).toHaveLength(1);
  });

  it("Paperclip fora do ar devolve o erro e não grava nada", async () => {
    const p = pc.criar({ titulo: "Sem Paperclip" });
    pc.estado.modo = "fora";
    try {
      expect((await aprovar(p.id)).tipo).toBe("erro");
    } finally {
      pc.estado.modo = "normal";
    }
    expect(await decisoes(p.id)).toHaveLength(0);
  });

  it("sem sessão recusa (vai para /entrar) e não decide nada", async () => {
    const p = pc.criar({ titulo: "Sem sessão" });
    const cookie = cabecalhos.cookie;
    cabecalhos.cookie = "";
    try {
      expect(await destinoDoRedirect(aprovar(p.id))).toMatch(/NEXT_REDIRECT.*\/entrar/);
      expect(await destinoDoRedirect(recusar(p.id, "motivo"))).toMatch(/NEXT_REDIRECT.*\/entrar/);
    } finally {
      cabecalhos.cookie = cookie;
    }
    expect(pc.pedidos.get(p.id)?.status).toBe("pending");
    expect(await decisoes(p.id)).toHaveLength(0);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarPaperclipFalso, type PaperclipFalso } from "../../test/falsos";
import { decidir, erroDoStatus, listarAprovacoes, verAprovacao } from "./cliente";

let pc: PaperclipFalso;

beforeAll(async () => {
  pc = await criarPaperclipFalso();
});
afterAll(async () => {
  await pc.fechar();
});

describe("cliente do Paperclip", () => {
  it("200: lista os pendentes do mais antigo para o mais novo e aprova", async () => {
    const a = pc.criar({ titulo: "primeiro" });
    const b = pc.criar({ titulo: "segundo" });
    const lista = await listarAprovacoes(pc.config, "pending");
    expect(lista.ok && lista.aprovacoes.map((x) => x.id)).toEqual([a.id, b.id]);

    const r = await decidir(pc.config, a.id, "approved");
    expect(r).toMatchObject({ ok: true, aprovacao: { id: a.id, status: "approved" } });
  });

  it("422: a decisão oposta volta como jaDecidido, com o pedido atual", async () => {
    const a = pc.criar({ titulo: "x" });
    pc.decidirNoPaperclip(a.id, "rejected", "não");
    const r = await decidir(pc.config, a.id, "approved");
    expect(r).toMatchObject({ ok: false, jaDecidido: true, aprovacao: { status: "rejected", decisionNote: "não" } });
  });

  it("401: chave recusada vira erro de chave, sem mostrar a chave", async () => {
    const r = await listarAprovacoes({ ...pc.config, chave: "pcp_board_errada" }, "pending");
    expect(r).toMatchObject({ ok: false, erro: { tipo: "chave" } });
    expect(JSON.stringify(r)).not.toContain("pcp_board_errada");
    expect(erroDoStatus(403).tipo).toBe("chave");
    expect(erroDoStatus(404).tipo).toBe("nao_encontrado");
    expect(erroDoStatus(500).tipo).toBe("fora_do_ar");
  });

  it("tempo esgotado e fora do ar viram erro fora_do_ar", async () => {
    pc.estado.modo = "lento";
    try {
      const r = await verAprovacao(pc.config, "qualquer");
      expect(r).toMatchObject({ ok: false, erro: { tipo: "fora_do_ar", mensagem: expect.stringMatching(/tempo/) } });
    } finally {
      pc.estado.modo = "normal";
    }
    const semServidor = await listarAprovacoes({ ...pc.config, url: "http://127.0.0.1:9" }, "pending");
    expect(semServidor).toMatchObject({ ok: false, erro: { tipo: "fora_do_ar" } });
  });
});

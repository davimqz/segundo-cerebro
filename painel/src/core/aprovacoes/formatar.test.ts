import { describe, expect, it } from "vitest";
import type { Aprovacao } from "../paperclip/cliente";
import {
  camposDe,
  cortarEscapado,
  dadosDoBotao,
  escaparHtml,
  lerBotao,
  LIMITE_TELEGRAM,
  linkDoPedido,
  mensagemDecidida,
  mensagemDoPedido,
  solicitanteDe,
  tituloDe,
} from "./formatar";
import { problemaNaDecisao } from "./servico";

function pedido(extra: Partial<Aprovacao> = {}): Aprovacao {
  return {
    id: "8f0c2c1e-1111-4222-8333-944455556666",
    companyId: "empresa",
    type: "request_board_approval",
    status: "pending",
    payload: { titulo: "Mandar e-mail", descricao: "Follow-up para o lead X", destinatario: "x@exemplo.com" },
    requestedByAgentId: null,
    requestedByUserId: null,
    decisionNote: null,
    decidedByUserId: null,
    decidedAt: null,
    createdAt: "2026-11-08T12:00:00.000Z",
    updatedAt: "2026-11-08T12:00:00.000Z",
    ...extra,
  };
}

describe("título e campos", () => {
  it("usa payload.titulo, ou o tipo quando não há título", () => {
    expect(tituloDe(pedido())).toBe("Mandar e-mail");
    expect(tituloDe(pedido({ payload: { titulo: "  " } }))).toBe("request_board_approval");
    expect(tituloDe(pedido({ payload: {} }))).toBe("request_board_approval");
  });

  it("lista os outros campos como campo: valor, com objetos em JSON", () => {
    const p = pedido({ payload: { titulo: "t", descricao: "d", valor: 120, itens: ["a", "b"], teste: true } });
    expect(camposDe(p)).toEqual([
      { campo: "valor", valor: "120" },
      { campo: "itens", valor: '["a","b"]' },
      { campo: "teste", valor: "true" },
    ]);
  });

  it("quem pediu: nome do agente, o id se o nome faltar, ou board", () => {
    const agentes = new Map([["ag-1", "Hermes"]]);
    expect(solicitanteDe(pedido({ requestedByAgentId: "ag-1" }), agentes)).toBe("Hermes");
    expect(solicitanteDe(pedido({ requestedByAgentId: "ag-2" }), agentes)).toBe("ag-2");
    expect(solicitanteDe(pedido(), agentes)).toBe("board");
  });
});

describe("mensagem do Telegram", () => {
  it("tem título, descrição, campos, quem pediu e o link, com HTML escapado", () => {
    const p = pedido({ payload: { titulo: "<script>", descricao: "a & b", nota: '"x"' } });
    const m = mensagemDoPedido(p, { solicitante: "Hermes", link: linkDoPedido("https://painel.x", p.id) });
    expect(m).toContain("<b>&lt;script&gt;</b>");
    expect(m).toContain("a &amp; b");
    expect(m).toContain("nota: &quot;x&quot;");
    expect(m).toContain("Pedido por: Hermes");
    expect(m).toContain(`<a href="https://painel.x/aprovacoes#pedido-${p.id}">Ver no painel</a>`);
    expect(m).not.toContain("<script>");
  });

  it("corta no limite com … e mantém o link", () => {
    const p = pedido({ payload: { titulo: "Longo", descricao: "<".repeat(5000) } });
    const m = mensagemDoPedido(p, { solicitante: "board", link: "https://painel.x/aprovacoes#pedido-1" });
    expect(m.length).toBeLessThanOrEqual(LIMITE_TELEGRAM);
    expect(m).toContain("…");
    expect(m).toContain("Ver no painel");
    // Não corta uma entidade ao meio.
    expect(m).not.toMatch(/&l…|&lt…;|&…/);
  });

  it("cortarEscapado não quebra emoji e respeita o limite escapado", () => {
    const r = cortarEscapado("😀".repeat(100), 21);
    expect(r.length).toBeLessThanOrEqual(21);
    expect(r.endsWith("…")).toBe(true);
    expect(Array.from(r.slice(0, -1)).every((c) => c === "😀")).toBe(true);
    expect(cortarEscapado("curto", 100)).toBe("curto");
    expect(escaparHtml("<a>")).toBe("&lt;a&gt;");
  });

  it("depois de decidido: decisão, lugar, hora e o motivo da recusa", () => {
    const aprovado = mensagemDecidida(pedido({ status: "approved", decidedAt: "2026-11-08T15:04:00.000Z" }), "painel");
    expect(aprovado).toMatch(/Aprovado no painel às \d{2}:\d{2}/);
    const recusado = mensagemDecidida(
      pedido({ status: "rejected", decidedAt: "2026-11-08T15:04:00.000Z", decisionNote: "Texto <ruim>" }),
      "telegram",
    );
    expect(recusado).toMatch(/Recusado no Telegram às \d{2}:\d{2}/);
    expect(recusado).toContain("Motivo: Texto &lt;ruim&gt;");
  });
});

describe("botões", () => {
  it("lê o callback_data de Aprovar e Recusar e recusa o resto", () => {
    const id = pedido().id;
    expect(lerBotao(dadosDoBotao("aprovar", id))).toEqual({ acao: "aprovar", id });
    expect(lerBotao(dadosDoBotao("recusar", id))).toEqual({ acao: "recusar", id });
    expect(Buffer.byteLength(dadosDoBotao("recusar", id))).toBeLessThanOrEqual(64);
    for (const ruim of ["x:1", "a:", "a:../1", "a:1 2", undefined, 3]) expect(lerBotao(ruim)).toBeNull();
  });
});

describe("regra da decisão", () => {
  it("recusar exige motivo; aprovar não", () => {
    expect(problemaNaDecisao("rejected", "")).toMatch(/motivo/);
    expect(problemaNaDecisao("rejected", "   ")).toMatch(/motivo/);
    expect(problemaNaDecisao("rejected", "Fora do tom")).toBeNull();
    expect(problemaNaDecisao("approved")).toBeNull();
    expect(problemaNaDecisao("rejected", "x".repeat(1001))).toMatch(/1000/);
  });
});

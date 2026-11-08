import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarPaperclipFalso, criarTelegramFalso, type PaperclipFalso, type TelegramFalso } from "../../test/falsos";
import { banco } from "../db/client";
import { aprovacoesTelegram, atividades, avisos } from "../db/schema";
import { criarClienteTelegram } from "../telegram/cliente";
import { AVISO_TELEGRAM, criarBot } from "./bot";
import { ACAO_APROVADA, ACAO_RECUSADA, AVISO_PAPERCLIP, decidirAprovacao } from "./servico";

const DAVI = 424242;
const OUTRO = 777;

let pc: PaperclipFalso;
let tg: TelegramFalso;

beforeAll(async () => {
  pc = await criarPaperclipFalso();
  tg = await criarTelegramFalso();
});

afterAll(async () => {
  await pc.fechar();
  await tg.fechar();
  await banco().$client.end();
});

beforeEach(async () => {
  // Cada teste começa sem pedidos pendentes de testes anteriores.
  for (const p of pc.pedidos.values()) if (p.status === "pending") pc.decidirNoPaperclip(p.id, "approved");
  await novoBot().cicloPaperclip();
  tg.limpar();
});

function novoBot() {
  return criarBot({
    paperclip: pc.config,
    telegram: criarClienteTelegram({ token: tg.token, base: tg.base }),
    chatId: String(DAVI),
    urlPainel: "https://painel.teste",
  });
}

async function decisoes(id: string) {
  return banco()
    .select()
    .from(atividades)
    .where(and(eq(atividades.alvo, id)));
}

async function registroDe(id: string) {
  const [r] = await banco().select().from(aprovacoesTelegram).where(eq(aprovacoesTelegram.aprovacaoId, id));
  return r;
}

async function avisosAbertos(origem: string) {
  return banco()
    .select()
    .from(avisos)
    .where(and(eq(avisos.origem, origem), isNull(avisos.resolvidoEm)));
}

function toque(dados: string, de = DAVI, mensagemId?: number) {
  tg.enfileirar({
    callback_query: {
      id: `q-${Math.random()}`,
      from: { id: de },
      data: dados,
      message: mensagemId ? { message_id: mensagemId, chat: { id: de } } : undefined,
    },
  });
}

describe("bot de aprovações", () => {
  it("pedido novo gera uma mensagem só, mesmo depois de reiniciar o bot", async () => {
    const p = pc.criar({ titulo: "Mandar proposta", descricao: "Para o cliente Y" });
    await novoBot().cicloPaperclip();
    await novoBot().cicloPaperclip();

    const envios = tg.de("sendMessage");
    expect(envios).toHaveLength(1);
    expect(envios[0].corpo.chat_id).toBe(String(DAVI));
    expect(String(envios[0].corpo.text)).toContain("Mandar proposta");
    expect(String(envios[0].corpo.text)).toContain(`https://painel.teste/aprovacoes#pedido-${p.id}`);
    expect(JSON.stringify(envios[0].corpo.reply_markup)).toContain(`a:${p.id}`);
    expect((await registroDe(p.id)).mensagemId).toBeGreaterThan(0);
  });

  it("aprovar pelo botão aprova no Paperclip, grava a atividade e tira os botões", async () => {
    const p = pc.criar({ titulo: "Post no LinkedIn" });
    const bot = novoBot();
    await bot.cicloPaperclip();
    const mensagemId = (await registroDe(p.id)).mensagemId!;

    toque(`a:${p.id}`, DAVI, mensagemId);
    await bot.cicloTelegram(0);

    expect(pc.pedidos.get(p.id)?.status).toBe("approved");
    const registros = await decisoes(p.id);
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({
      acao: ACAO_APROVADA,
      autorTipo: "usuario",
      autorId: `telegram:${DAVI}`,
      detalhes: { origem: "telegram" },
    });
    const edicao = tg.de("editMessageText").at(-1)!;
    expect(edicao.corpo.message_id).toBe(mensagemId);
    expect(String(edicao.corpo.text)).toMatch(/Aprovado no Telegram às \d{2}:\d{2}/);
    expect(edicao.corpo.reply_markup).toBeUndefined();
    expect((await registroDe(p.id)).statusVisto).toBe("approved");

    // O ciclo seguinte não mexe de novo na mensagem nem grava outra atividade.
    tg.limpar();
    await bot.cicloPaperclip();
    expect(tg.de("editMessageText")).toHaveLength(0);
    expect(await decisoes(p.id)).toHaveLength(1);
  });

  it("recusar pede o motivo e usa a resposta", async () => {
    const p = pc.criar({ titulo: "Gastar R$ 50" });
    const bot = novoBot();
    await bot.cicloPaperclip();
    const mensagemId = (await registroDe(p.id)).mensagemId!;

    toque(`r:${p.id}`, DAVI, mensagemId);
    await bot.cicloTelegram(0);
    const pergunta = tg.de("sendMessage").at(-1)!;
    expect(String(pergunta.corpo.text)).toContain("motivo");
    expect(pergunta.corpo.reply_markup).toMatchObject({ force_reply: true });
    expect(pc.pedidos.get(p.id)?.status).toBe("pending");
    const perguntaId = (await registroDe(p.id)).perguntaMotivoId!;
    expect(perguntaId).toBeGreaterThan(0);

    tg.enfileirar({
      message: {
        message_id: 9001,
        from: { id: DAVI },
        chat: { id: DAVI },
        text: "Caro demais",
        reply_to_message: { message_id: perguntaId },
      },
    });
    await bot.cicloTelegram(0);

    expect(pc.pedidos.get(p.id)).toMatchObject({ status: "rejected", decisionNote: "Caro demais" });
    const registros = await decisoes(p.id);
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({
      acao: ACAO_RECUSADA,
      detalhes: { origem: "telegram", motivo: "Caro demais" },
    });
    const edicao = tg.de("editMessageText").find((c) => c.corpo.message_id === mensagemId)!;
    expect(String(edicao.corpo.text)).toMatch(/Recusado no Telegram às \d{2}:\d{2}\nMotivo: Caro demais/);
    expect((await registroDe(p.id)).perguntaMotivoId).toBeNull();
  });

  it("decisão no painel atualiza a mensagem e anula a pergunta de motivo aberta", async () => {
    const p = pc.criar({ titulo: "Responder cliente" });
    const bot = novoBot();
    await bot.cicloPaperclip();
    const mensagemId = (await registroDe(p.id)).mensagemId!;
    toque(`r:${p.id}`, DAVI, mensagemId);
    await bot.cicloTelegram(0);
    const perguntaId = (await registroDe(p.id)).perguntaMotivoId!;

    const r = await decidirAprovacao(pc.config, {
      id: p.id,
      decisao: "approved",
      origem: "painel",
      autor: { tipo: "usuario", id: "usuario-painel" },
    });
    expect(r.tipo).toBe("ok");
    tg.limpar();
    await bot.cicloPaperclip();

    const edicoes = tg.de("editMessageText");
    expect(String(edicoes.find((c) => c.corpo.message_id === mensagemId)?.corpo.text)).toMatch(
      /Aprovado no painel às \d{2}:\d{2}/,
    );
    expect(String(edicoes.find((c) => c.corpo.message_id === perguntaId)?.corpo.text)).toMatch(/Sem efeito/);

    // A resposta atrasada à pergunta não decide nada.
    tg.enfileirar({
      message: {
        message_id: 9002,
        from: { id: DAVI },
        chat: { id: DAVI },
        text: "motivo atrasado",
        reply_to_message: { message_id: perguntaId },
      },
    });
    await bot.cicloTelegram(0);
    expect(pc.pedidos.get(p.id)?.status).toBe("approved");
    expect(await decisoes(p.id)).toHaveLength(1);
  });

  it("decisão na tela do Paperclip grava origem paperclip", async () => {
    const p = pc.criar({ titulo: "Contratar agente" });
    const bot = novoBot();
    await bot.cicloPaperclip();
    pc.decidirNoPaperclip(p.id, "rejected", "Agora não");
    await bot.cicloPaperclip();
    await bot.cicloPaperclip();

    const registros = await decisoes(p.id);
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({
      acao: ACAO_RECUSADA,
      autorId: "paperclip:usuario-board",
      detalhes: { origem: "paperclip", motivo: "Agora não" },
    });
    expect(String(tg.de("editMessageText").at(-1)?.corpo.text)).toMatch(/Recusado no Paperclip/);
  });

  it("toque depois de decidido responde Já decidido, sem decidir de novo", async () => {
    const p = pc.criar({ titulo: "Já foi" });
    const bot = novoBot();
    await bot.cicloPaperclip();
    const mensagemId = (await registroDe(p.id)).mensagemId!;
    await decidirAprovacao(pc.config, {
      id: p.id,
      decisao: "approved",
      origem: "painel",
      autor: { tipo: "usuario", id: "usuario-painel" },
    });

    toque(`r:${p.id}`, DAVI, mensagemId);
    toque(`a:${p.id}`, DAVI, mensagemId);
    await bot.cicloTelegram(0);
    const respostas = tg.de("answerCallbackQuery").map((c) => c.corpo.text);
    expect(respostas).toEqual(["Já decidido no painel.", "Já decidido no painel."]);
    expect(await decisoes(p.id)).toHaveLength(1);
    expect(pc.pedidos.get(p.id)?.status).toBe("approved");
  });

  it("toque ou mensagem de outra pessoa é ignorado", async () => {
    const p = pc.criar({ titulo: "Só o Davi" });
    const bot = novoBot();
    await bot.cicloPaperclip();
    tg.limpar();

    toque(`a:${p.id}`, OUTRO, 55);
    tg.enfileirar({ message: { message_id: 56, from: { id: OUTRO }, chat: { id: OUTRO }, text: "oi" } });
    // Davi no grupo de outra pessoa também não vale.
    tg.enfileirar({
      callback_query: {
        id: "q-grupo",
        from: { id: DAVI },
        data: `a:${p.id}`,
        message: { message_id: 57, chat: { id: OUTRO } },
      },
    });
    await bot.cicloTelegram(0);

    expect(pc.pedidos.get(p.id)?.status).toBe("pending");
    expect(await decisoes(p.id)).toHaveLength(0);
    expect(tg.chamadas.filter((c) => c.metodo !== "getUpdates")).toHaveLength(0);
  });

  it("Paperclip fora do ar cria um aviso só e o resolve quando volta", async () => {
    const bot = novoBot();
    pc.estado.modo = "fora";
    try {
      await bot.cicloPaperclip();
      await bot.cicloPaperclip();
      expect(await avisosAbertos(AVISO_PAPERCLIP)).toHaveLength(1);
    } finally {
      pc.estado.modo = "normal";
    }
    await bot.cicloPaperclip();
    expect(await avisosAbertos(AVISO_PAPERCLIP)).toHaveLength(0);
  });

  it("Telegram fora do ar cria um aviso só, não perde o pedido e resolve quando volta", async () => {
    const p = pc.criar({ titulo: "Durante a queda" });
    const bot = novoBot();
    tg.estado.fora = true;
    try {
      await bot.cicloPaperclip();
      await expect(bot.cicloTelegram(0)).rejects.toThrow(/getUpdates/);
      await bot.cicloPaperclip();
      const abertos = await avisosAbertos(AVISO_TELEGRAM);
      expect(abertos).toHaveLength(1);
      expect(abertos[0].mensagem).not.toContain(tg.token);
      expect(await registroDe(p.id)).toBeUndefined();
    } finally {
      tg.estado.fora = false;
    }
    await bot.cicloPaperclip();
    await bot.cicloTelegram(0);
    expect(tg.de("sendMessage")).toHaveLength(1);
    expect(await avisosAbertos(AVISO_TELEGRAM)).toHaveLength(0);
  });
});

describe("bot de aprovações: recuperação", () => {
  it("o aviso do Telegram some quando a conexão volta, mesmo sem pedido novo para mandar", async () => {
    const p = pc.criar({ titulo: "Falha passageira" });
    const bot = novoBot();
    tg.estado.fora = true;
    try {
      await bot.cicloPaperclip();
      expect(await avisosAbertos(AVISO_TELEGRAM)).toHaveLength(1);
    } finally {
      tg.estado.fora = false;
    }
    // Decidido no Paperclip enquanto o Telegram estava fora: não sobra nada para mandar.
    pc.decidirNoPaperclip(p.id, "approved");
    await bot.cicloTelegram(0);
    await bot.cicloPaperclip();
    expect(await avisosAbertos(AVISO_TELEGRAM)).toHaveLength(0);
  });

  it("reserva sem mensagem há mais de 1 minuto é mandada de novo; a recente, não", async () => {
    const antigo = pc.criar({ titulo: "Envio perdido" });
    const recente = pc.criar({ titulo: "Envio em andamento" });
    await banco()
      .insert(aprovacoesTelegram)
      .values([{ aprovacaoId: antigo.id, criadoEm: new Date(Date.now() - 2 * 60_000) }, { aprovacaoId: recente.id }]);
    const bot = novoBot();
    await bot.cicloPaperclip();
    await bot.cicloPaperclip();

    const envios = tg.de("sendMessage");
    expect(envios).toHaveLength(1);
    expect(String(envios[0].corpo.text)).toContain("Envio perdido");
    expect((await registroDe(antigo.id)).mensagemId).toBeGreaterThan(0);
    expect((await registroDe(recente.id)).mensagemId).toBeNull();
  });
});

describe("decidirAprovacao", () => {
  it("dois cliques ao mesmo tempo gravam uma atividade só", async () => {
    const p = pc.criar({ titulo: "Corrida" });
    const autor = { tipo: "usuario" as const, id: "usuario-painel" };
    const [a, b] = await Promise.all([
      decidirAprovacao(pc.config, { id: p.id, decisao: "approved", origem: "painel", autor }),
      decidirAprovacao(pc.config, { id: p.id, decisao: "approved", origem: "telegram", autor }),
    ]);
    expect([a.tipo, b.tipo].sort()).toEqual(["ja_decidido", "ok"]);
    expect(await decisoes(p.id)).toHaveLength(1);
  });
});

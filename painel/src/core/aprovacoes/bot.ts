import { and, eq, isNull } from "drizzle-orm";
import { garantirAviso, resolverAvisosDe } from "../avisos/servico";
import { banco } from "../db/client";
import { aprovacoesTelegram } from "../db/schema";
import type { ConfigPaperclip } from "../env";
import { listarAprovacoes, nomesDosAgentes, verAprovacao, type Aprovacao } from "../paperclip/cliente";
import { ErroTelegram, type AtualizacaoTelegram, type ClienteTelegram } from "../telegram/cliente";
import {
  dadosDoBotao,
  lerBotao,
  linkDoPedido,
  mensagemDecidida,
  mensagemDoPedido,
  NOME_DA_ORIGEM,
  solicitanteDe,
  tituloDe,
  escaparHtml,
  type Origem,
} from "./formatar";
import { anotarSaudeDoPaperclip, decidirAprovacao, registrarDecisaoExterna } from "./servico";

// O bot de aprovações (spec 006, ADR 0008). Dois ciclos, chamados pelo scripts/bot-aprovacoes.ts:
// - cicloPaperclip (a cada ~10 s): manda os pedidos novos e atualiza as mensagens dos decididos;
// - tratar (para cada atualização do long polling): botões Aprovar/Recusar e a resposta com o motivo.
// O estado fica na tabela aprovacoes_telegram, para sobreviver a um reinício do container.

export const AVISO_TELEGRAM = "aprovacoes:telegram";
/** Depois disso, uma reserva sem mensagem é tratada como envio perdido. */
export const RESERVA_PERDIDA_MS = 60_000;

type Registro = { info: (m: string) => void; erro: (m: string) => void };

export type DependenciasDoBot = {
  paperclip: ConfigPaperclip;
  telegram: ClienteTelegram;
  /** O único ID aceito (TELEGRAM_APROVACOES_CHAT_ID). */
  chatId: string;
  urlPainel: string;
  log?: Registro;
};

const silencioso: Registro = { info: () => {}, erro: () => {} };

export function botoesDoPedido(id: string) {
  return [
    [
      { text: "Aprovar", callback_data: dadosDoBotao("aprovar", id) },
      { text: "Recusar", callback_data: dadosDoBotao("recusar", id) },
    ],
  ];
}

export function criarBot(d: DependenciasDoBot) {
  const log = d.log ?? silencioso;
  const autor = { tipo: "usuario" as const, id: `telegram:${d.chatId}` };

  // Um aviso só para o Telegram, resolvido quando a busca (long polling) e o envio voltam a funcionar.
  const falhas = { busca: false, envio: false };

  async function anotarTelegram(parte: keyof typeof falhas, e: unknown | null) {
    falhas[parte] = e !== null;
    if (e !== null) {
      const msg = e instanceof Error ? e.message : String(e);
      log.erro(msg);
      await garantirAviso("erro", `Bot de aprovações: falha no ${msg}`, AVISO_TELEGRAM);
    } else if (!falhas.busca && !falhas.envio) {
      await resolverAvisosDe(AVISO_TELEGRAM);
    }
  }

  /** Responde ao toque (tira o "carregando" do botão). Toque antigo demais não é falha. */
  async function responder(q: { id: string }, texto?: string) {
    await d.telegram.answerCallbackQuery(q.id, texto).catch(() => {});
  }

  async function registro(id: string) {
    const [r] = await banco().select().from(aprovacoesTelegram).where(eq(aprovacoesTelegram.aprovacaoId, id));
    return r ?? null;
  }

  async function atualizarRegistro(id: string, campos: Partial<typeof aprovacoesTelegram.$inferInsert>) {
    await banco()
      .update(aprovacoesTelegram)
      .set({ ...campos, atualizadoEm: new Date() })
      .where(eq(aprovacoesTelegram.aprovacaoId, id));
  }

  /** Troca a mensagem do pedido pelo resultado, anula a pergunta de motivo aberta e guarda o status. */
  async function mostrarDecidido(a: Aprovacao, origem: Origem | null, mensagemId?: number | null) {
    const r = await registro(a.id);
    const alvo = mensagemId ?? r?.mensagemId ?? null;
    if (alvo) await d.telegram.editMessageText(d.chatId, alvo, mensagemDecidida(a, origem));
    if (r?.perguntaMotivoId) {
      const onde = origem ? ` no ${NOME_DA_ORIGEM[origem]}` : "";
      await d.telegram
        .editMessageText(d.chatId, r.perguntaMotivoId, `Sem efeito: o pedido já foi decidido${onde}.`)
        .catch(() => {});
    }
    if (r) await atualizarRegistro(a.id, { statusVisto: a.status, perguntaMotivoId: null });
  }

  /** Manda os pedidos pendentes novos (uma vez só) e atualiza as mensagens dos que foram decididos. */
  async function cicloPaperclip(): Promise<void> {
    const pendentes = await listarAprovacoes(d.paperclip, "pending");
    await anotarSaudeDoPaperclip(pendentes.ok ? null : pendentes.erro);
    if (!pendentes.ok) {
      log.erro(`Paperclip: ${pendentes.erro.mensagem}`);
      return;
    }

    const conhecidos = new Map((await banco().select().from(aprovacoesTelegram)).map((r) => [r.aprovacaoId, r]));
    const idsPendentes = new Set(pendentes.aprovacoes.map((a) => a.id));

    // Uma reserva sem mensagem há mais de 1 minuto é de um envio que caiu no meio: manda de novo.
    // (Se a queda foi depois do envio, a mensagem sai duas vezes; é melhor que nunca chegar.)
    const limiteReserva = Date.now() - RESERVA_PERDIDA_MS;
    const perdida = (id: string) => {
      const r = conhecidos.get(id);
      return !!r && r.mensagemId === null && r.perguntaMotivoId === null && r.criadoEm.getTime() < limiteReserva;
    };
    const novos = pendentes.aprovacoes.filter((a) => !conhecidos.has(a.id) || perdida(a.id));
    const agentes = novos.some((a) => a.requestedByAgentId) ? await nomesDosAgentes(d.paperclip) : undefined;
    let usouTelegram = false;
    for (const a of novos) {
      // Reserva antes de mandar: se o container cair no meio, o pedido não é mandado duas vezes.
      const [reservado] = perdida(a.id)
        ? await banco()
            .update(aprovacoesTelegram)
            .set({ criadoEm: new Date(), atualizadoEm: new Date() })
            .where(and(eq(aprovacoesTelegram.aprovacaoId, a.id), isNull(aprovacoesTelegram.mensagemId)))
            .returning()
        : await banco().insert(aprovacoesTelegram).values({ aprovacaoId: a.id }).onConflictDoNothing().returning();
      if (!reservado) continue;
      usouTelegram = true;
      let mensagemId: number;
      try {
        const texto = mensagemDoPedido(a, {
          solicitante: solicitanteDe(a, agentes),
          link: linkDoPedido(d.urlPainel, a.id),
        });
        mensagemId = (await d.telegram.sendMessage(d.chatId, texto, { botoes: botoesDoPedido(a.id) })).message_id;
      } catch (e) {
        // Não mandou: libera a reserva para tentar no próximo ciclo.
        await banco().delete(aprovacoesTelegram).where(eq(aprovacoesTelegram.aprovacaoId, a.id));
        await anotarTelegram("envio", e);
        continue;
      }
      // Já mandou: uma falha ao gravar não pode liberar a reserva (mandaria de novo).
      await atualizarRegistro(a.id, { mensagemId }).catch((e) =>
        log.erro(`pedido ${a.id}: mensagem mandada, mas não gravada: ${e instanceof Error ? e.message : e}`),
      );
      log.info(`pedido ${a.id} mandado`);
      await anotarTelegram("envio", null);
    }

    for (const r of conhecidos.values()) {
      if (r.statusVisto !== "pending" || idsPendentes.has(r.aprovacaoId)) continue;
      const atual = await verAprovacao(d.paperclip, r.aprovacaoId);
      if (!atual.ok) {
        if (atual.erro.tipo === "nao_encontrado") await atualizarRegistro(r.aprovacaoId, { statusVisto: "sumiu" });
        continue;
      }
      if (atual.aprovacao.status === "pending") continue;
      const origem = (await registrarDecisaoExterna(atual.aprovacao)) ?? null;
      usouTelegram = true;
      try {
        await mostrarDecidido(atual.aprovacao, origem);
        await anotarTelegram("envio", null);
      } catch (e) {
        await anotarTelegram("envio", e);
      }
    }

    // Nada para mandar neste ciclo: uma falha de envio antiga não segura o aviso aberto. Uma falha que
    // continua (pedido sem conseguir sair) é tentada de novo a cada ciclo e mantém o aviso.
    if (!usouTelegram) await anotarTelegram("envio", null);
  }

  function ehDoDavi(id: number | undefined) {
    return id !== undefined && String(id) === d.chatId;
  }

  async function responderBotao(q: NonNullable<AtualizacaoTelegram["callback_query"]>) {
    const botao = lerBotao(q.data);
    const mensagemId = q.message?.message_id;
    if (!botao) {
      await responder(q);
      return;
    }

    if (botao.acao === "aprovar") {
      const r = await decidirAprovacao(d.paperclip, {
        id: botao.id,
        decisao: "approved",
        origem: "telegram",
        autor,
      });
      if (r.tipo === "erro") {
        await responder(q, `Não deu: ${r.mensagem}`);
        return;
      }
      const origem = r.tipo === "ok" ? "telegram" : r.origem;
      await mostrarDecidido(r.aprovacao, origem, mensagemId);
      await responder(q, r.tipo === "ok" ? "Aprovado." : `Já decidido no ${NOME_DA_ORIGEM[origem ?? "paperclip"]}.`);
      return;
    }

    // Recusar: confere se ainda está pendente e pergunta o motivo numa mensagem de resposta.
    const atual = await verAprovacao(d.paperclip, botao.id);
    if (!atual.ok) {
      await responder(q, `Não deu: ${atual.erro.mensagem}`);
      return;
    }
    if (atual.aprovacao.status !== "pending") {
      const origem = await registrarDecisaoExterna(atual.aprovacao);
      await mostrarDecidido(atual.aprovacao, origem, mensagemId);
      await responder(q, `Já decidido no ${NOME_DA_ORIGEM[origem ?? "paperclip"]}.`);
      return;
    }
    const pergunta = await d.telegram.sendMessage(
      d.chatId,
      `Qual o motivo da recusa de <b>${escaparHtml(tituloDe(atual.aprovacao))}</b>? Responda a esta mensagem.`,
      { responderA: mensagemId, pedirResposta: true },
    );
    await banco()
      .insert(aprovacoesTelegram)
      .values({ aprovacaoId: botao.id, mensagemId: mensagemId ?? null, perguntaMotivoId: pergunta.message_id })
      .onConflictDoUpdate({
        target: aprovacoesTelegram.aprovacaoId,
        set: { perguntaMotivoId: pergunta.message_id, atualizadoEm: new Date() },
      });
    await responder(q, "Responda com o motivo.");
  }

  async function responderMensagem(m: MensagemDoDavi) {
    const respondida = m.reply_to_message?.message_id;
    if (!respondida) return;
    const [r] = await banco()
      .select()
      .from(aprovacoesTelegram)
      .where(eq(aprovacoesTelegram.perguntaMotivoId, respondida));
    if (!r) return;
    const motivo = m.text?.trim() ?? "";
    if (!motivo) {
      await d.telegram.sendMessage(d.chatId, "Mande o motivo em texto, respondendo à pergunta.", {
        responderA: respondida,
      });
      return;
    }
    const res = await decidirAprovacao(d.paperclip, {
      id: r.aprovacaoId,
      decisao: "rejected",
      motivo,
      origem: "telegram",
      autor,
    });
    if (res.tipo === "erro") {
      await d.telegram.sendMessage(d.chatId, `Não deu: ${escaparHtml(res.mensagem)}`, { responderA: m.message_id });
      return;
    }
    const origem = res.tipo === "ok" ? "telegram" : res.origem;
    // A pergunta é respondida: tira do registro antes de editar, para não virar "Sem efeito".
    await atualizarRegistro(r.aprovacaoId, { perguntaMotivoId: null });
    await mostrarDecidido(res.aprovacao, origem);
    if (res.tipo === "ja_decidido") {
      await d.telegram.sendMessage(d.chatId, `Já decidido no ${NOME_DA_ORIGEM[origem ?? "paperclip"]}.`, {
        responderA: m.message_id,
      });
    }
  }

  type MensagemDoDavi = NonNullable<AtualizacaoTelegram["message"]>;

  /** Trata uma atualização do Telegram. Só o ID do Davi é aceito; o resto é ignorado. */
  async function tratar(u: AtualizacaoTelegram): Promise<void> {
    if (u.callback_query) {
      const q = u.callback_query;
      if (!ehDoDavi(q.from.id) || (q.message && !ehDoDavi(q.message.chat.id))) {
        log.info("toque de outra conta ignorado");
        return;
      }
      await responderBotao(q);
      return;
    }
    if (u.message) {
      if (!ehDoDavi(u.message.from?.id) || !ehDoDavi(u.message.chat.id)) {
        log.info("mensagem de outra conta ignorada");
        return;
      }
      await responderMensagem(u.message);
    }
  }

  let offset: number | undefined;

  /** Uma rodada do long polling: busca, trata e confirma as atualizações. */
  async function cicloTelegram(espera = 25, sinal?: AbortSignal): Promise<void> {
    let atualizacoes: AtualizacaoTelegram[];
    try {
      atualizacoes = await d.telegram.getUpdates(offset, espera, sinal);
    } catch (e) {
      if (sinal?.aborted) return;
      await anotarTelegram("busca", e);
      throw e;
    }
    await anotarTelegram("busca", null);
    for (const u of atualizacoes) {
      offset = u.update_id + 1;
      try {
        await tratar(u);
      } catch (e) {
        if (e instanceof ErroTelegram) await anotarTelegram("envio", e);
        else log.erro(`atualização ${u.update_id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return { cicloPaperclip, cicloTelegram, tratar };
}

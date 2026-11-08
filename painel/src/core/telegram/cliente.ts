// Cliente mínimo da Bot API do Telegram para o bot de aprovações (spec 006). Só `fetch`, sem
// biblioteca. O token fica na URL de cada chamada: por isso nenhuma mensagem de erro leva a URL.

export type BotaoInline = { text: string; callback_data: string };

export type MensagemTelegram = {
  message_id: number;
  chat: { id: number };
  from?: { id: number };
  text?: string;
  reply_to_message?: { message_id: number };
};

export type AtualizacaoTelegram = {
  update_id: number;
  message?: MensagemTelegram;
  callback_query?: { id: string; from: { id: number }; data?: string; message?: MensagemTelegram };
};

export class ErroTelegram extends Error {
  constructor(
    readonly metodo: string,
    readonly codigo: number | null,
    descricao: string,
  ) {
    super(`Telegram ${metodo}: ${descricao}`);
    this.name = "ErroTelegram";
  }
}

export type ClienteTelegram = ReturnType<typeof criarClienteTelegram>;

export function criarClienteTelegram(opcoes: { token: string; base?: string }) {
  const base = (opcoes.base ?? "https://api.telegram.org").replace(/\/+$/, "");

  async function chamar<T>(metodo: string, corpo: unknown, tempoMs: number, sinal?: AbortSignal): Promise<T> {
    const sinais = [AbortSignal.timeout(tempoMs)];
    if (sinal) sinais.push(sinal);
    let r: Response;
    try {
      r = await fetch(`${base}/bot${opcoes.token}/${metodo}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
        signal: AbortSignal.any(sinais),
      });
    } catch (e) {
      const nome = e instanceof Error ? e.name : "";
      if (sinal?.aborted) throw new ErroTelegram(metodo, null, "cancelado");
      throw new ErroTelegram(metodo, null, nome === "TimeoutError" ? "sem resposta" : "sem conexão");
    }
    let dados: { ok?: boolean; result?: T; description?: string; error_code?: number } = {};
    try {
      dados = await r.json();
    } catch {
      dados = {};
    }
    if (!r.ok || !dados.ok) {
      // A descrição vem do Telegram (ex.: "Unauthorized") e não contém o token.
      throw new ErroTelegram(metodo, dados.error_code ?? r.status, dados.description ?? `HTTP ${r.status}`);
    }
    return dados.result as T;
  }

  return {
    /** Long polling: espera até `espera` segundos por atualizações a partir de `offset`. */
    getUpdates(offset: number | undefined, espera: number, sinal?: AbortSignal) {
      return chamar<AtualizacaoTelegram[]>(
        "getUpdates",
        { offset, timeout: espera, allowed_updates: ["message", "callback_query"] },
        (espera + 10) * 1000,
        sinal,
      );
    },

    sendMessage(
      chatId: string | number,
      texto: string,
      extra: { botoes?: BotaoInline[][]; responderA?: number; pedirResposta?: boolean } = {},
    ) {
      const corpo: Record<string, unknown> = {
        chat_id: chatId,
        text: texto,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      };
      if (extra.botoes) corpo.reply_markup = { inline_keyboard: extra.botoes };
      else if (extra.pedirResposta) corpo.reply_markup = { force_reply: true, selective: true };
      if (extra.responderA)
        corpo.reply_parameters = { message_id: extra.responderA, allow_sending_without_reply: true };
      return chamar<MensagemTelegram>("sendMessage", corpo, 15000);
    },

    /** Troca o texto da mensagem. Sem `botoes`, os botões somem. "Não modificado" não é erro. */
    async editMessageText(chatId: string | number, mensagemId: number, texto: string, botoes?: BotaoInline[][]) {
      const corpo: Record<string, unknown> = {
        chat_id: chatId,
        message_id: mensagemId,
        text: texto,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      };
      if (botoes) corpo.reply_markup = { inline_keyboard: botoes };
      try {
        await chamar<unknown>("editMessageText", corpo, 15000);
      } catch (e) {
        if (e instanceof ErroTelegram && /not modified/i.test(e.message)) return;
        throw e;
      }
    },

    async answerCallbackQuery(id: string, texto?: string) {
      await chamar<unknown>("answerCallbackQuery", { callback_query_id: id, text: texto }, 15000);
    },
  };
}

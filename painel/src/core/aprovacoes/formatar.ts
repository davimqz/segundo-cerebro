import type { Aprovacao } from "../paperclip/cliente";

// Textos das aprovações: título, campos do payload e as mensagens do bot do Telegram (spec 006).
// Sem dependência do banco nem do Next, para os testes de unidade.

/** Limite de caracteres de uma mensagem do Telegram. */
export const LIMITE_TELEGRAM = 4096;

export type Origem = "painel" | "telegram" | "paperclip";

export const NOME_DA_ORIGEM: Record<Origem, string> = {
  painel: "painel",
  telegram: "Telegram",
  paperclip: "Paperclip",
};

export function ehOrigem(v: unknown): v is Origem {
  return v === "painel" || v === "telegram" || v === "paperclip";
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** `payload.titulo` ou, sem título, o tipo do pedido. */
export function tituloDe(a: Pick<Aprovacao, "type" | "payload">): string {
  return texto(a.payload.titulo) ?? a.type;
}

export function descricaoDe(a: Pick<Aprovacao, "payload">): string | null {
  return texto(a.payload.descricao);
}

/** Os outros campos do payload, como "campo: valor". Objetos e listas viram JSON. */
export function camposDe(a: Pick<Aprovacao, "payload">): { campo: string; valor: string }[] {
  return Object.entries(a.payload)
    .filter(([campo]) => campo !== "titulo" && campo !== "descricao")
    .map(([campo, valor]) => ({
      campo,
      valor: typeof valor === "string" ? valor : valor === undefined ? "" : JSON.stringify(valor),
    }));
}

/** Quem pediu: o nome do agente (ou o id, se o nome não veio) ou "board". */
export function solicitanteDe(a: Pick<Aprovacao, "requestedByAgentId">, agentes?: Map<string, string>): string {
  if (!a.requestedByAgentId) return "board";
  return agentes?.get(a.requestedByAgentId) ?? a.requestedByAgentId;
}

export function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Corta o texto (sem quebrar emoji) para que, escapado, caiba em `limite`. Termina com "…" se cortou. */
export function cortarEscapado(s: string, limite: number): string {
  if (escaparHtml(s).length <= limite) return escaparHtml(s);
  const letras = Array.from(s);
  let fim = Math.min(letras.length, limite);
  while (fim > 0) {
    const candidato = escaparHtml(letras.slice(0, fim).join("").trimEnd()) + "…";
    if (candidato.length <= limite) return candidato;
    fim -= Math.max(1, Math.ceil((candidato.length - limite) / 6));
  }
  return "…";
}

export function linkDoPedido(urlPainel: string, id: string): string {
  return `${urlPainel}/aprovacoes#pedido-${encodeURIComponent(id)}`;
}

/** A mensagem de um pedido novo no Telegram (HTML), cortada no limite com o link do painel. */
export function mensagemDoPedido(a: Aprovacao, opcoes: { solicitante: string; link: string }): string {
  const cabeca = `<b>Pedido de aprovação</b>\n<b>${escaparHtml(tituloDe(a))}</b>`;
  const rodape = `Pedido por: ${escaparHtml(opcoes.solicitante)}\n<a href="${escaparHtml(opcoes.link)}">Ver no painel</a>`;

  const partes: string[] = [];
  const descricao = descricaoDe(a);
  if (descricao) partes.push(descricao);
  const campos = camposDe(a);
  if (campos.length) partes.push(campos.map((c) => `${c.campo}: ${c.valor}`).join("\n"));
  const corpo = partes.join("\n\n");

  const fixo = cabeca.length + rodape.length + 4; // as duas quebras duplas em volta do corpo
  if (!corpo) return `${cabeca}\n\n${rodape}`;
  return `${cabeca}\n\n${cortarEscapado(corpo, LIMITE_TELEGRAM - fixo)}\n\n${rodape}`;
}

/** "HH:MM" no fuso do servidor (TZ). */
export function horaMinuto(quando: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(quando),
  );
}

/** "Aprovado" ou "Recusado" (ou o status cru, se for outro). */
export function nomeDaDecisao(status: string): string {
  if (status === "approved") return "Aprovado";
  if (status === "rejected") return "Recusado";
  return status;
}

/** A mensagem depois de decidida, sem botões: "Aprovado no painel às HH:MM" (e o motivo, se recusado). */
export function mensagemDecidida(a: Aprovacao, origem: Origem | null): string {
  const titulo = `<b>${escaparHtml(tituloDe(a))}</b>`;
  if (a.status !== "approved" && a.status !== "rejected") {
    return `${titulo}\n\nO pedido saiu da fila (status: ${escaparHtml(a.status)}).`;
  }
  const onde = origem ? ` no ${NOME_DA_ORIGEM[origem]}` : "";
  const quando = a.decidedAt ? ` às ${horaMinuto(a.decidedAt)}` : "";
  let linha = `${nomeDaDecisao(a.status)}${onde}${quando}`;
  if (a.status === "rejected" && a.decisionNote) {
    linha += `\nMotivo: ${cortarEscapado(a.decisionNote, 1000)}`;
  }
  return `${titulo}\n\n${linha}`;
}

export type AcaoDoBotao = { acao: "aprovar" | "recusar"; id: string };

/** Os botões guardam "a:<id>" ou "r:<id>" (o Telegram aceita até 64 bytes). */
export function dadosDoBotao(acao: AcaoDoBotao["acao"], id: string): string {
  return `${acao === "aprovar" ? "a" : "r"}:${id}`;
}

export function lerBotao(dados: unknown): AcaoDoBotao | null {
  if (typeof dados !== "string") return null;
  const m = /^([ar]):([A-Za-z0-9-]{1,60})$/.exec(dados);
  if (!m) return null;
  return { acao: m[1] === "a" ? "aprovar" : "recusar", id: m[2] };
}

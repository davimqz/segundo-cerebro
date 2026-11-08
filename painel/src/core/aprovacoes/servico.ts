import { and, desc, inArray, sql } from "drizzle-orm";
import { registrar } from "../atividades/servico";
import { garantirAviso, resolverAvisosDe } from "../avisos/servico";
import { banco } from "../db/client";
import { atividades } from "../db/schema";
import type { ConfigPaperclip } from "../env";
import {
  decidir,
  listarAprovacoes,
  verAprovacao,
  type Aprovacao,
  type Decisao,
  type ErroPaperclip,
} from "../paperclip/cliente";
import { ehOrigem, tituloDe, type Origem } from "./formatar";

// Único caminho de decisão das aprovações (spec 006, ADR 0008): a tela e o bot passam por aqui.

export const ACAO_APROVADA = "aprovacao_aprovada";
export const ACAO_RECUSADA = "aprovacao_recusada";
export const MOTIVO_MAXIMO = 1000;
/** Origem dos avisos quando o Paperclip falha (um só aviso, do painel ou do bot). */
export const AVISO_PAPERCLIP = "aprovacoes:paperclip";

const PENDENTES = new Set(["pending", "revision_requested"]);

export type Autor = { tipo: "usuario"; id: string };

export type ResultadoDecisao =
  | { tipo: "ok"; aprovacao: Aprovacao }
  | { tipo: "ja_decidido"; aprovacao: Aprovacao; origem: Origem | null }
  | { tipo: "erro"; mensagem: string; erro?: ErroPaperclip };

/** Recusar exige motivo. Devolve a mensagem do problema, ou null se estiver tudo certo. */
export function problemaNaDecisao(decisao: Decisao, motivo?: string | null): string | null {
  const m = motivo?.trim() ?? "";
  if (decisao === "rejected" && !m) return "Escreva o motivo da recusa.";
  if (m.length > MOTIVO_MAXIMO) return `O motivo passa de ${MOTIVO_MAXIMO} caracteres.`;
  return null;
}

type Tx = Parameters<Parameters<ReturnType<typeof banco>["transaction"]>[0]>[0];

/** Trava o pedido até o fim da transação: painel e bot nunca decidem o mesmo pedido ao mesmo tempo. */
async function travar(tx: Tx, id: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"aprovacao:" + id}, 0))`);
}

/** Onde cada pedido foi decidido, pela atividade gravada (a mais recente vale). */
export async function origensGravadas(ids: string[], tx: Pick<Tx, "select"> = banco()): Promise<Map<string, Origem>> {
  const mapa = new Map<string, Origem>();
  if (!ids.length) return mapa;
  const linhas = await tx
    .select({ alvo: atividades.alvo, detalhes: atividades.detalhes })
    .from(atividades)
    .where(and(inArray(atividades.acao, [ACAO_APROVADA, ACAO_RECUSADA]), inArray(atividades.alvo, ids)))
    .orderBy(desc(atividades.id));
  for (const l of linhas) {
    const origem = l.detalhes?.origem;
    if (l.alvo && !mapa.has(l.alvo) && ehOrigem(origem)) mapa.set(l.alvo, origem);
  }
  return mapa;
}

function detalhesDe(a: Aprovacao, origem: Origem): Record<string, unknown> {
  const d: Record<string, unknown> = { origem, tipo: a.type, titulo: tituloDe(a) };
  if (a.status === "rejected" && a.decisionNote) d.motivo = a.decisionNote;
  return d;
}

/** Erros da chave ou de conexão viram um aviso na faixa; quando o Paperclip responde, ele é resolvido. */
export async function anotarSaudeDoPaperclip(erro: ErroPaperclip | null): Promise<void> {
  if (!erro) {
    await resolverAvisosDe(AVISO_PAPERCLIP);
    return;
  }
  if (erro.tipo === "chave" || erro.tipo === "fora_do_ar") {
    await garantirAviso("erro", `Aprovações: ${erro.mensagem}`, AVISO_PAPERCLIP);
  }
}

/**
 * Aprova ou recusa um pedido no Paperclip e grava a atividade, só quando a decisão foi aplicada aqui.
 * Se o pedido já estava decidido (em outro lugar ou por um 422), devolve `ja_decidido` com a origem.
 */
export async function decidirAprovacao(
  config: ConfigPaperclip,
  e: { id: string; decisao: Decisao; motivo?: string | null; origem: Origem; autor: Autor },
): Promise<ResultadoDecisao> {
  const problema = problemaNaDecisao(e.decisao, e.motivo);
  if (problema) return { tipo: "erro", mensagem: problema };

  const r = await banco().transaction(async (tx): Promise<ResultadoDecisao> => {
    await travar(tx, e.id);
    const atual = await verAprovacao(config, e.id);
    if (!atual.ok) return { tipo: "erro", mensagem: atual.erro.mensagem, erro: atual.erro };
    if (!PENDENTES.has(atual.aprovacao.status)) {
      const origem = (await origensGravadas([e.id], tx)).get(e.id) ?? null;
      return { tipo: "ja_decidido", aprovacao: atual.aprovacao, origem };
    }

    const d = await decidir(config, e.id, e.decisao, e.motivo);
    if (d.ok) {
      await registrar(
        {
          autorTipo: e.autor.tipo,
          autorId: e.autor.id,
          acao: e.decisao === "approved" ? ACAO_APROVADA : ACAO_RECUSADA,
          alvo: e.id,
          detalhes: detalhesDe(d.aprovacao, e.origem),
        },
        tx,
      );
      return { tipo: "ok", aprovacao: d.aprovacao };
    }
    if (d.jaDecidido) {
      const origem = (await origensGravadas([e.id], tx)).get(e.id) ?? null;
      return { tipo: "ja_decidido", aprovacao: d.aprovacao, origem };
    }
    return { tipo: "erro", mensagem: d.erro.mensagem, erro: d.erro };
  });

  if (r.tipo === "erro" && r.erro) await anotarSaudeDoPaperclip(r.erro);
  return r;
}

/**
 * Pedido decidido fora do painel e do bot (na tela do Paperclip): grava a atividade com
 * `origem = "paperclip"`, se ainda não houver uma. Devolve a origem que vale para o pedido.
 */
export async function registrarDecisaoExterna(a: Aprovacao): Promise<Origem | null> {
  if (a.status !== "approved" && a.status !== "rejected") return null;
  return banco().transaction(async (tx) => {
    await travar(tx, a.id);
    const gravada = (await origensGravadas([a.id], tx)).get(a.id);
    if (gravada) return gravada;
    await registrar(
      {
        autorTipo: "usuario",
        autorId: `paperclip:${a.decidedByUserId ?? "board"}`,
        acao: a.status === "approved" ? ACAO_APROVADA : ACAO_RECUSADA,
        alvo: a.id,
        detalhes: detalhesDe(a, "paperclip"),
      },
      tx,
    );
    return "paperclip";
  });
}

export type ItemDoHistorico = { aprovacao: Aprovacao; origem: Origem | null };

/** Os últimos pedidos decididos (aprovados e recusados), do mais novo para o mais antigo, com o lugar. */
export async function historico(
  config: ConfigPaperclip,
  limite = 20,
): Promise<{ ok: true; itens: ItemDoHistorico[] } | { ok: false; erro: ErroPaperclip }> {
  const [aprovados, recusados] = await Promise.all([
    listarAprovacoes(config, "approved"),
    listarAprovacoes(config, "rejected"),
  ]);
  if (!aprovados.ok) return aprovados;
  if (!recusados.ok) return recusados;
  const decididos = [...aprovados.aprovacoes, ...recusados.aprovacoes]
    .sort((a, b) => (b.decidedAt ?? b.updatedAt).localeCompare(a.decidedAt ?? a.updatedAt))
    .slice(0, limite);
  const origens = await origensGravadas(decididos.map((a) => a.id));
  return { ok: true, itens: decididos.map((a) => ({ aprovacao: a, origem: origens.get(a.id) ?? null })) };
}

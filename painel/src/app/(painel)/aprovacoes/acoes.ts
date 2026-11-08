"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { horaMinuto, NOME_DA_ORIGEM, nomeDaDecisao } from "@/core/aprovacoes/formatar";
import { decidirAprovacao, type ResultadoDecisao } from "@/core/aprovacoes/servico";
import { exigirSessao } from "@/core/auth/sessao";
import { aprovacoesConfiguradas } from "@/core/env";
import type { Decisao } from "@/core/paperclip/cliente";

export type RespostaDaAcao = { tipo: "ok" | "ja_decidido" | "erro"; mensagem: string };

const esquemaId = z
  .string()
  .regex(/^[A-Za-z0-9-]{1,60}$/)
  .catch("");

function resposta(r: ResultadoDecisao): RespostaDaAcao {
  if (r.tipo === "erro") return { tipo: "erro", mensagem: r.mensagem };
  const decisao = nomeDaDecisao(r.aprovacao.status);
  const quando = r.aprovacao.decidedAt ? ` às ${horaMinuto(r.aprovacao.decidedAt)}` : "";
  if (r.tipo === "ok") return { tipo: "ok", mensagem: `${decisao}${quando}.` };
  const onde = ` no ${NOME_DA_ORIGEM[r.origem ?? "paperclip"]}`;
  return { tipo: "ja_decidido", mensagem: `Já decidido: ${decisao}${onde}${quando}.` };
}

async function decidirPeloPainel(idBruto: unknown, decisao: Decisao, motivo?: string): Promise<RespostaDaAcao> {
  // A própria ação confere a sessão; não confia na tela.
  const usuario = await exigirSessao();
  const id = esquemaId.parse(idBruto);
  if (!id) return { tipo: "erro", mensagem: "Pedido inválido." };
  const config = aprovacoesConfiguradas();
  if (!config) return { tipo: "erro", mensagem: "As aprovações não estão configuradas." };
  const r = await decidirAprovacao(config, {
    id,
    decisao,
    motivo,
    origem: "painel",
    autor: { tipo: "usuario", id: usuario.id },
  });
  if (r.tipo !== "erro") revalidatePath("/aprovacoes");
  return resposta(r);
}

export async function aprovar(id: string): Promise<RespostaDaAcao> {
  return decidirPeloPainel(id, "approved");
}

export async function recusar(id: string, motivo: string): Promise<RespostaDaAcao> {
  return decidirPeloPainel(id, "rejected", typeof motivo === "string" ? motivo : "");
}

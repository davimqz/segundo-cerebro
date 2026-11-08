import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { registrar } from "../atividades/servico";
import { banco } from "../db/client";
import { AVISO_TIPOS, avisos, type AvisoTipo } from "../db/schema";

export type Aviso = typeof avisos.$inferSelect;

export function ehTipoDeAviso(valor: unknown): valor is AvisoTipo {
  return typeof valor === "string" && (AVISO_TIPOS as readonly string[]).includes(valor);
}

/** Avisos ainda não resolvidos, do mais antigo para o mais novo. */
export async function abertos(): Promise<Aviso[]> {
  return banco().select().from(avisos).where(isNull(avisos.resolvidoEm)).orderBy(asc(avisos.criadoEm));
}

export async function criar(tipo: AvisoTipo, mensagem: string, origem: string): Promise<Aviso> {
  const texto = mensagem.trim();
  if (!ehTipoDeAviso(tipo)) throw new Error(`Tipo de aviso inválido: ${String(tipo)}`);
  if (!texto) throw new Error("A mensagem do aviso não pode ficar vazia");
  if (texto.length > 500) throw new Error("A mensagem do aviso passa de 500 caracteres");

  return banco().transaction(async (tx) => {
    const [aviso] = await tx.insert(avisos).values({ tipo, mensagem: texto, origem }).returning();
    await registrar(
      {
        autorTipo: "sistema",
        autorId: origem,
        acao: "aviso_criado",
        alvo: `aviso:${aviso.id}`,
        detalhes: { tipo, mensagem: texto },
      },
      tx,
    );
    return aviso;
  });
}

/**
 * Marca o aviso como resolvido e grava `aviso_resolvido` na mesma transação.
 * Devolve false se o aviso não existe ou já estava resolvido.
 */
export async function resolver(id: number, usuario: { id: string }): Promise<boolean> {
  return banco().transaction(async (tx) => {
    const [aviso] = await tx
      .update(avisos)
      .set({ resolvidoEm: new Date(), resolvidoPor: usuario.id })
      .where(and(eq(avisos.id, id), isNull(avisos.resolvidoEm)))
      .returning();
    if (!aviso) return false;
    await registrar(
      {
        autorTipo: "usuario",
        autorId: usuario.id,
        acao: "aviso_resolvido",
        alvo: `aviso:${aviso.id}`,
        detalhes: { tipo: aviso.tipo, mensagem: aviso.mensagem },
      },
      tx,
    );
    return true;
  });
}

/**
 * Garante um único aviso aberto para a origem dada (usado pelo painel e pelo bot quando um serviço
 * cai). Se já houver um aberto, não cria outro. Devolve true se criou.
 */
export async function garantirAviso(tipo: AvisoTipo, mensagem: string, origem: string): Promise<boolean> {
  const texto = mensagem.trim().slice(0, 500);
  return banco().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"aviso:" + origem}, 0))`);
    const [aberto] = await tx
      .select({ id: avisos.id })
      .from(avisos)
      .where(and(eq(avisos.origem, origem), isNull(avisos.resolvidoEm)))
      .limit(1);
    if (aberto) return false;
    const [aviso] = await tx.insert(avisos).values({ tipo, mensagem: texto, origem }).returning();
    await registrar(
      {
        autorTipo: "sistema",
        autorId: origem,
        acao: "aviso_criado",
        alvo: `aviso:${aviso.id}`,
        detalhes: { tipo, mensagem: texto },
      },
      tx,
    );
    return true;
  });
}

/** Resolve, pelo sistema, os avisos abertos da origem (quando o serviço volta). Devolve quantos. */
export async function resolverAvisosDe(origem: string): Promise<number> {
  return banco().transaction(async (tx) => {
    const resolvidos = await tx
      .update(avisos)
      .set({ resolvidoEm: new Date(), resolvidoPor: origem })
      .where(and(eq(avisos.origem, origem), isNull(avisos.resolvidoEm)))
      .returning();
    for (const aviso of resolvidos) {
      await registrar(
        {
          autorTipo: "sistema",
          autorId: origem,
          acao: "aviso_resolvido",
          alvo: `aviso:${aviso.id}`,
          detalhes: { tipo: aviso.tipo, mensagem: aviso.mensagem },
        },
        tx,
      );
    }
    return resolvidos.length;
  });
}

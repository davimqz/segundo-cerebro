import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, isNull, type SQL } from "drizzle-orm";
import { registrar } from "../atividades/servico";
import { banco } from "../db/client";
import { chavesAgentes, ESCOPOS, type Escopo } from "../db/schema";

// Chaves de agente das rotas /api/v1 (spec 007, ADR 0009). O banco guarda só o SHA-256 da chave;
// a chave aparece uma única vez, na saída do comando que a cria.

export { ESCOPOS, type Escopo };

export const PREFIXO = "pnl_";
/** Quem grava as atividades das chaves (os comandos rodam no servidor, sem usuário logado). */
export const AUTOR_CHAVES = "script:chave";
const NOME_DO_AGENTE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
// 32 bytes em base64url = 43 caracteres.
const FORMATO = /^pnl_[A-Za-z0-9_-]{43}$/;

export function gerarChave(): string {
  return PREFIXO + randomBytes(32).toString("base64url");
}

export function hashDaChave(chave: string): string {
  return createHash("sha256").update(chave, "utf8").digest("hex");
}

export function ehEscopo(valor: unknown): valor is Escopo {
  return typeof valor === "string" && (ESCOPOS as readonly string[]).includes(valor);
}

/** A chave do cabeçalho `Authorization: Bearer <chave>`, ou null se faltar ou tiver outro formato. */
export function chaveDoCabecalho(valor: string | null): string | null {
  const m = /^Bearer +(\S+)$/i.exec(valor?.trim() ?? "");
  return m && FORMATO.test(m[1]) ? m[1] : null;
}

function validar(agente: string, escopos: string[]): Escopo[] {
  if (!NOME_DO_AGENTE.test(agente)) {
    throw new Error("Nome de agente inválido: use letras minúsculas, números, hífen ou sublinhado (até 32).");
  }
  const desconhecidos = escopos.filter((e) => !ehEscopo(e));
  if (desconhecidos.length) throw new Error(`Escopo desconhecido: ${desconhecidos.join(", ")}`);
  if (!escopos.length) throw new Error("Informe pelo menos um escopo.");
  return [...new Set(escopos)] as Escopo[];
}

/** Cria a chave e grava `chave_criada`. A chave em texto só existe no retorno desta função. */
export async function criarChave(agente: string, escopos: string[]): Promise<{ id: number; chave: string }> {
  const lista = validar(agente, escopos);
  const chave = gerarChave();
  return banco().transaction(async (tx) => {
    const [linha] = await tx
      .insert(chavesAgentes)
      .values({ agente, hash: hashDaChave(chave), escopos: lista })
      .returning({ id: chavesAgentes.id });
    await registrar(
      {
        autorTipo: "sistema",
        autorId: AUTOR_CHAVES,
        acao: "chave_criada",
        alvo: `chave:${linha.id}`,
        detalhes: { agente, escopos: lista },
      },
      tx,
    );
    return { id: linha.id, chave };
  });
}

export type ChaveListada = {
  id: number;
  agente: string;
  escopos: Escopo[];
  criadaEm: Date;
  revogadaEm: Date | null;
};

/** Todas as chaves, sem o hash. */
export async function listarChaves(): Promise<ChaveListada[]> {
  return banco()
    .select({
      id: chavesAgentes.id,
      agente: chavesAgentes.agente,
      escopos: chavesAgentes.escopos,
      criadaEm: chavesAgentes.criadaEm,
      revogadaEm: chavesAgentes.revogadaEm,
    })
    .from(chavesAgentes)
    .orderBy(asc(chavesAgentes.id));
}

type Revogavel = { id: number; agente: string; escopos: Escopo[] };

async function revogar(condicao: SQL, manter?: (ativas: Revogavel[]) => number | undefined) {
  return banco().transaction(async (tx) => {
    const ativas = await tx
      .select({ id: chavesAgentes.id, agente: chavesAgentes.agente, escopos: chavesAgentes.escopos })
      .from(chavesAgentes)
      .where(and(condicao, isNull(chavesAgentes.revogadaEm)))
      .orderBy(desc(chavesAgentes.id))
      .for("update");
    const fica = manter?.(ativas);
    const revogadas = ativas.filter((c) => c.id !== fica);
    for (const c of revogadas) {
      await tx.update(chavesAgentes).set({ revogadaEm: new Date() }).where(eq(chavesAgentes.id, c.id));
      await registrar(
        {
          autorTipo: "sistema",
          autorId: AUTOR_CHAVES,
          acao: "chave_revogada",
          alvo: `chave:${c.id}`,
          detalhes: { agente: c.agente, escopos: c.escopos },
        },
        tx,
      );
    }
    return revogadas.map((c) => c.id);
  });
}

/** Revoga uma chave ativa e grava `chave_revogada`. Devolve false se ela não existe ou já estava revogada. */
export async function revogarChave(id: number): Promise<boolean> {
  return (await revogar(eq(chavesAgentes.id, id))).length > 0;
}

/**
 * Revoga as chaves ativas do agente. Com `manterUltima`, a mais nova continua valendo (usado pelo
 * criar-chave-hermes.sh depois de gravar a chave nova). Devolve os ids revogados.
 */
export async function revogarChavesDe(agente: string, opcoes: { manterUltima?: boolean } = {}): Promise<number[]> {
  return revogar(eq(chavesAgentes.agente, agente), opcoes.manterUltima ? (ativas) => ativas[0]?.id : undefined);
}

/**
 * Confere a chave do pedido. Devolve o agente dono dela, ou a resposta de erro pronta:
 * 401 sem dizer o motivo (sem chave, desconhecida ou revogada) e 403 se falta o escopo.
 * A comparação é pelo hash: a chave em texto nunca vai ao banco nem aos logs.
 */
export async function autenticar(request: Request, escopo: Escopo): Promise<{ agente: string } | Response> {
  const chave = chaveDoCabecalho(request.headers.get("authorization"));
  if (!chave) return naoAutorizado();
  const [linha] = await banco()
    .select({ agente: chavesAgentes.agente, escopos: chavesAgentes.escopos })
    .from(chavesAgentes)
    .where(and(eq(chavesAgentes.hash, hashDaChave(chave)), isNull(chavesAgentes.revogadaEm)))
    .limit(1);
  if (!linha) return naoAutorizado();
  if (!linha.escopos.includes(escopo)) {
    return Response.json({ erro: "sem_permissao" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  return { agente: linha.agente };
}

function naoAutorizado(): Response {
  return Response.json(
    { erro: "nao_autorizado" },
    { status: 401, headers: { "Cache-Control": "no-store", "WWW-Authenticate": "Bearer" } },
  );
}

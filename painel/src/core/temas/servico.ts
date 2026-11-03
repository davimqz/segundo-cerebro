import { asc, eq, sql } from "drizzle-orm";
import selecta from "../../../seed/temas/selecta.json";
import { registrar } from "../atividades/servico";
import { banco } from "../db/client";
import { departamentos, temas } from "../db/schema";
import { tokensOpcionaisFaltando, validarTema, type Tema } from "./schema";

export type TemaAtivo = { id: number | null; nome: string; tema: Tema };

/**
 * Tema ativo da tabela `temas`. Se não houver tema ativo ou ele estiver inválido, usa o Selecta
 * da seed, para o painel nunca abrir sem estilo.
 */
export async function temaAtivo(): Promise<TemaAtivo> {
  try {
    const [linha] = await banco().select().from(temas).where(eq(temas.ativo, true)).limit(1);
    if (linha) {
      const r = validarTema(linha.tokens);
      if (r.ok) return { id: linha.id, nome: linha.nome, tema: r.tema };
      console.error("Tema ativo inválido; usando o Selecta da seed.", { tema: linha.nome, erros: r.erros });
    }
  } catch (erro) {
    console.error("Não foi possível ler o tema ativo; usando o Selecta da seed.", erro);
  }
  return { id: null, nome: "Selecta", tema: temaPadrao() };
}

export function temaPadrao(): Tema {
  const r = validarTema(selecta);
  if (!r.ok) throw new Error(`seed/temas/selecta.json inválido: ${r.erros.join("; ")}`);
  return r.tema;
}

/** Tamanho máximo do tokens.json, em bytes (o Selecta tem cerca de 6 KB). */
export const TAMANHO_MAXIMO = 256 * 1024;

export type ResultadoTema = { ok: true; avisos?: string[] } | { ok: false; erros: string[] };

export type ItemDaLista = { id: number; nome: string; ativo: boolean; padrao: boolean; criadoEm: Date };

type Usuario = { id: string };

/** Todos os temas instalados, do mais antigo para o mais novo (sem os tokens). */
export async function listarTemas(): Promise<ItemDaLista[]> {
  return banco()
    .select({ id: temas.id, nome: temas.nome, ativo: temas.ativo, padrao: temas.padrao, criadoEm: temas.criadoEm })
    .from(temas)
    .orderBy(asc(temas.criadoEm), asc(temas.id));
}

// Trava da transação que muda a tabela `temas`: instalar e ativar ao mesmo tempo esperam um pelo
// outro. Assim a checagem de nome repetido vale sem índice único no banco.
const travarTemas = sql`select pg_advisory_xact_lock(hashtext('painel:temas'))`;

/**
 * Instala um tokens.json como tema inativo. A validação, o nome repetido, a gravação e o registro
 * em `atividades` acontecem na mesma transação: se algo falha, nada é gravado.
 */
export async function instalarTema(arquivo: string, usuario: Usuario): Promise<ResultadoTema> {
  if (Buffer.byteLength(arquivo, "utf8") > TAMANHO_MAXIMO) {
    return { ok: false, erros: [`O arquivo passa de ${TAMANHO_MAXIMO / 1024} KB`] };
  }
  let entrada: unknown;
  try {
    entrada = JSON.parse(arquivo);
  } catch {
    return { ok: false, erros: ["O arquivo não é um JSON válido"] };
  }
  const r = validarTema(entrada);
  if (!r.ok) return r;
  const tema = r.tema;

  return banco().transaction(async (tx) => {
    await tx.execute(travarTemas);
    const repetido = await tx
      .select({ id: temas.id })
      .from(temas)
      .where(sql`lower(trim(${temas.nome})) = lower(${tema.name})`)
      .limit(1);
    if (repetido.length) return { ok: false, erros: ["Já existe um tema com esse nome"] };

    const slugs = (
      await tx.select({ slug: departamentos.slug }).from(departamentos).orderBy(asc(departamentos.ordem))
    ).map((d) => d.slug);
    const faltando = tokensOpcionaisFaltando(tema, slugs);

    const [linha] = await tx.insert(temas).values({ nome: tema.name, tokens: tema }).returning({ id: temas.id });
    await registrar(
      {
        autorTipo: "usuario",
        autorId: usuario.id,
        acao: "tema_instalado",
        alvo: tema.name,
        detalhes: { id: linha.id, opcionaisFaltando: faltando },
      },
      tx,
    );

    if (!faltando.length) return { ok: true };
    return {
      ok: true,
      avisos: [`Faltam tokens opcionais: ${faltando.join(", ")}. Eles vão usar a cor de texto secundário.`],
    };
  });
}

/**
 * Ativa um tema: desativa o anterior, ativa o escolhido e grava `tema_ativado` numa só transação.
 * Se o tema não existe ou está inválido no banco, nada muda.
 */
export async function ativarTema(id: number, usuario: Usuario): Promise<ResultadoTema> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, erros: ["Tema não encontrado"] };

  return banco().transaction(async (tx) => {
    await tx.execute(travarTemas);
    const [escolhido] = await tx.select().from(temas).where(eq(temas.id, id)).limit(1);
    if (!escolhido) return { ok: false, erros: ["Tema não encontrado"] };
    if (escolhido.ativo) return { ok: true };

    const r = validarTema(escolhido.tokens);
    if (!r.ok) return { ok: false, erros: [`O tema "${escolhido.nome}" está inválido no banco`, ...r.erros] };

    const [anterior] = await tx
      .select({ id: temas.id, nome: temas.nome })
      .from(temas)
      .where(eq(temas.ativo, true))
      .limit(1);
    // Primeiro desativa: o índice "só um ativo" é conferido a cada comando.
    await tx.update(temas).set({ ativo: false }).where(eq(temas.ativo, true));
    await tx.update(temas).set({ ativo: true }).where(eq(temas.id, id));
    await registrar(
      {
        autorTipo: "usuario",
        autorId: usuario.id,
        acao: "tema_ativado",
        alvo: escolhido.nome,
        detalhes: { id, anterior: anterior ?? null },
      },
      tx,
    );
    return { ok: true };
  });
}

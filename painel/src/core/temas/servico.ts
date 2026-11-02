import { eq } from "drizzle-orm";
import selecta from "../../../seed/temas/selecta.json";
import { banco } from "../db/client";
import { temas } from "../db/schema";
import { validarTema, type Tema } from "./schema";

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

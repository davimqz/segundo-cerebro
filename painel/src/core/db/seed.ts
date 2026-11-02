import { eq } from "drizzle-orm";
import departamentosPadrao from "../../../seed/departamentos.json";
import selecta from "../../../seed/temas/selecta.json";
import { validarTema } from "../temas/schema";
import type { Banco } from "./client";
import { departamentos, temas } from "./schema";

/**
 * Instala o modelo padrão: os departamentos e o tema Selecta. Pode rodar várias vezes: não
 * sobrescreve o que já existe, então mudanças feitas no banco (por cliente) continuam valendo.
 */
export async function semear(db: Banco): Promise<void> {
  const r = validarTema(selecta);
  if (!r.ok) throw new Error(`seed/temas/selecta.json inválido: ${r.erros.join("; ")}`);

  await db.transaction(async (tx) => {
    await tx
      .insert(departamentos)
      .values(departamentosPadrao.map((d) => ({ slug: d.slug, nome: d.nome, ordem: d.ordem, areas: d.areas })))
      .onConflictDoNothing({ target: departamentos.slug });

    const [padrao] = await tx.select({ id: temas.id }).from(temas).where(eq(temas.padrao, true)).limit(1);
    if (!padrao) {
      const [ativo] = await tx.select({ id: temas.id }).from(temas).where(eq(temas.ativo, true)).limit(1);
      await tx.insert(temas).values({ nome: r.tema.name, tokens: r.tema, padrao: true, ativo: !ativo });
    }
  });
}

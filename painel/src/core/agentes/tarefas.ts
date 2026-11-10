import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { registrar } from "../atividades/servico";
import { banco } from "../db/client";
import { atividades, departamentos } from "../db/schema";

// Registro, em Atividades, das tarefas que um agente criou no Paperclip (spec 007).

export const ACAO_TAREFA_CRIADA = "tarefa_criada";

export const esquemaTarefa = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  titulo: z.string().trim().min(1).max(300),
  departamento: z.string().trim().max(100).nullish(),
  link: z
    .string()
    .trim()
    .max(500)
    .regex(/^https?:\/\//i)
    .nullish(),
});

export type DadosTarefa = z.infer<typeof esquemaTarefa>;

/** Compara nomes sem diferenciar maiúsculas nem acentos ("administracao" = "Administração"). */
export function normalizar(texto: string): string {
  return texto.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}

/**
 * Grava `tarefa_criada` com o agente da chave como autor. O mesmo id de tarefa não é gravado duas
 * vezes (o mcp-paperclip pode repetir o pedido): devolve `criada: false` nesse caso.
 */
export async function registrarTarefaCriada(agente: string, dados: DadosTarefa): Promise<{ criada: boolean }> {
  const alvo = `paperclip:${dados.id}`;
  return banco().transaction(async (tx) => {
    // Dois pedidos iguais ao mesmo tempo: o segundo espera o primeiro e encontra a atividade.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"tarefa:" + alvo}, 0))`);
    const [existente] = await tx
      .select({ id: atividades.id })
      .from(atividades)
      .where(and(eq(atividades.acao, ACAO_TAREFA_CRIADA), eq(atividades.alvo, alvo)))
      .limit(1);
    if (existente) return { criada: false };

    let departamentoId: number | null = null;
    if (dados.departamento) {
      const procurado = normalizar(dados.departamento);
      const todos = await tx.select({ id: departamentos.id, nome: departamentos.nome }).from(departamentos);
      departamentoId = todos.find((d) => normalizar(d.nome) === procurado)?.id ?? null;
    }

    await registrar(
      {
        autorTipo: "agente",
        autorId: agente,
        acao: ACAO_TAREFA_CRIADA,
        alvo,
        departamentoId,
        detalhes: { titulo: dados.titulo, link: dados.link ?? null },
      },
      tx,
    );
    return { criada: true };
  });
}

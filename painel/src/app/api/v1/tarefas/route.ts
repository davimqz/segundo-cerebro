import { json, rotaDeAgente } from "@/core/agentes/rota";
import { esquemaTarefa, registrarTarefaCriada } from "@/core/agentes/tarefas";

export const dynamic = "force-dynamic";

// Registra em Atividades uma tarefa que o agente criou no Paperclip (spec 007). O autor vem sempre
// da chave, nunca do corpo. 201 ao gravar, 200 se o mesmo id já estava registrado.
export const POST = rotaDeAgente("tarefas:registrar", async (request, agente) => {
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return json({ erro: "corpo_invalido" }, 400);
  }
  const dados = esquemaTarefa.safeParse(corpo);
  if (!dados.success) return json({ erro: "corpo_invalido" }, 400);
  const { criada } = await registrarTarefaCriada(agente, dados.data);
  return json({ registrada: criada }, criada ? 201 : 200);
});

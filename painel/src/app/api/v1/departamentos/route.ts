import { json, rotaDeAgente } from "@/core/agentes/rota";
import { listarDepartamentos } from "@/core/departamentos/servico";

export const dynamic = "force-dynamic";

// Departamentos na ordem do menu (spec 007).
export const GET = rotaDeAgente("departamentos:ler", async () => {
  const lista = await listarDepartamentos();
  return json(lista.map((d) => ({ slug: d.slug, nome: d.nome, areas: d.areas })));
});

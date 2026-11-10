import { json, rotaDeAgente } from "@/core/agentes/rota";
import { ultimasAtividades } from "@/core/atividades/servico";

export const dynamic = "force-dynamic";

const PADRAO = 20;
const MAXIMO = 50;

// As N atividades mais novas, sem `detalhes` (spec 007). ?limite=N, padrão 20, máximo 50.
export const GET = rotaDeAgente("atividades:ler", async (request) => {
  const pedido = Number.parseInt(new URL(request.url).searchParams.get("limite") ?? "", 10);
  const limite = Number.isFinite(pedido) ? Math.min(MAXIMO, Math.max(1, pedido)) : PADRAO;
  return json(await ultimasAtividades(limite));
});

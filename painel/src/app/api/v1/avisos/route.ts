import { json, rotaDeAgente } from "@/core/agentes/rota";
import { abertos } from "@/core/avisos/servico";

export const dynamic = "force-dynamic";

// Avisos ainda não resolvidos (spec 007).
export const GET = rotaDeAgente("avisos:ler", async () => {
  const lista = await abertos();
  return json(lista.map((a) => ({ tipo: a.tipo, mensagem: a.mensagem, origem: a.origem, criado_em: a.criadoEm })));
});

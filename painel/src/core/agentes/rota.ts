import { autenticar, type Escopo } from "./chaves";

// Molde das rotas /api/v1 (spec 007): confere a chave e o escopo, responde JSON sem cache e, se o
// banco cair, 503 sem detalhes. A chave nunca vai para o log.

export function json(corpo: unknown, status = 200): Response {
  return Response.json(corpo, { status, headers: { "Cache-Control": "no-store" } });
}

export function rotaDeAgente(
  escopo: Escopo,
  atender: (request: Request, agente: string) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const r = await autenticar(request, escopo);
      if (r instanceof Response) return r;
      return await atender(request, r.agente);
    } catch (erro) {
      // Só a mensagem: o pedido (com o cabeçalho da chave) não é registrado.
      console.error(`API v1: falha em ${new URL(request.url).pathname}:`, erro instanceof Error ? erro.message : erro);
      return json({ erro: "indisponivel" }, 503);
    }
  };
}

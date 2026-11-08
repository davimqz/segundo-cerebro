import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { Aprovacao } from "../core/paperclip/cliente";

// Paperclip e Telegram falsos em servidores HTTP locais, para os testes (spec 006). O Paperclip
// falso segue o contrato conferido em scripts/teste-paperclip.sh: 422 na decisão oposta, 200 sem
// mudar nada ao repetir e 401 com a chave errada.

async function lerCorpo(req: IncomingMessage): Promise<unknown> {
  let bruto = "";
  for await (const parte of req) bruto += parte;
  if (!bruto) return {};
  try {
    return JSON.parse(bruto);
  } catch {
    return {};
  }
}

function json(res: ServerResponse, status: number, corpo: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(corpo));
}

async function ouvir(servidor: Server): Promise<string> {
  await new Promise<void>((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const { port } = servidor.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

export type PaperclipFalso = Awaited<ReturnType<typeof criarPaperclipFalso>>;

export async function criarPaperclipFalso() {
  const empresaId = randomUUID();
  const chave = `pcp_board_teste_${randomUUID()}`;
  const pedidos = new Map<string, Aprovacao>();
  const agentes = new Map<string, string>();
  const estado = { modo: "normal" as "normal" | "fora" | "lento", chamadas: [] as string[] };

  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    estado.chamadas.push(`${req.method} ${url.pathname}`);
    if (estado.modo === "fora") return json(res, 503, { error: "fora do ar" });
    if (estado.modo === "lento") return; // nunca responde
    if (req.headers.authorization !== `Bearer ${chave}`) return json(res, 401, { error: "Unauthorized" });

    const partes = url.pathname.split("/").filter(Boolean); // api, ...
    if (req.method === "GET" && partes[1] === "companies" && partes[3] === "approvals") {
      if (partes[2] !== empresaId) return json(res, 403, { error: "Forbidden" });
      const status = url.searchParams.get("status");
      return json(
        res,
        200,
        [...pedidos.values()].filter((p) => !status || p.status === status),
      );
    }
    if (req.method === "GET" && partes[1] === "companies" && partes[3] === "agents") {
      return json(
        res,
        200,
        [...agentes].map(([id, name]) => ({ id, name })),
      );
    }
    if (partes[1] === "approvals" && partes[2]) {
      const p = pedidos.get(partes[2]);
      if (!p) return json(res, 404, { error: "Approval not found" });
      if (req.method === "GET" && partes.length === 3) return json(res, 200, p);
      if (req.method === "POST" && (partes[3] === "approve" || partes[3] === "reject")) {
        const corpo = (await lerCorpo(req)) as { decisionNote?: string | null };
        const alvo = partes[3] === "approve" ? "approved" : "rejected";
        if (p.status !== "pending") {
          if (p.status === alvo) return json(res, 200, p);
          return json(res, 422, { error: `Only pending approvals can be ${alvo}` });
        }
        decidirAqui(p, alvo, corpo.decisionNote ?? null);
        return json(res, 200, p);
      }
    }
    json(res, 404, { error: "not found" });
  });

  function decidirAqui(p: Aprovacao, status: "approved" | "rejected", nota: string | null) {
    const agora = new Date().toISOString();
    Object.assign(p, {
      status,
      decisionNote: nota,
      decidedAt: agora,
      updatedAt: agora,
      decidedByUserId: "usuario-board",
    });
  }

  const url = await ouvir(servidor);

  return {
    url,
    empresaId,
    chave,
    estado,
    pedidos,
    agentes,
    config: { url, empresaId, chave, tempoLimiteMs: 300 },
    /** Cria um pedido pendente, como um agente faria. */
    criar(payload: Record<string, unknown>, extra: Partial<Aprovacao> = {}): Aprovacao {
      const agora = new Date(Date.now() + pedidos.size).toISOString();
      const p: Aprovacao = {
        id: randomUUID(),
        companyId: empresaId,
        type: "request_board_approval",
        status: "pending",
        payload,
        requestedByAgentId: null,
        requestedByUserId: "usuario-board",
        decisionNote: null,
        decidedByUserId: null,
        decidedAt: null,
        createdAt: agora,
        updatedAt: agora,
        ...extra,
      };
      pedidos.set(p.id, p);
      return p;
    },
    /** Decide direto no Paperclip (como na tela dele), sem passar pelo painel. */
    decidirNoPaperclip(id: string, status: "approved" | "rejected", nota: string | null = null) {
      const p = pedidos.get(id);
      if (!p) throw new Error("pedido inexistente");
      decidirAqui(p, status, nota);
    },
    fechar: () =>
      new Promise<void>((resolve) => {
        servidor.closeAllConnections();
        servidor.close(() => resolve());
      }),
  };
}

export type ChamadaTelegram = { metodo: string; corpo: Record<string, unknown> };

export type TelegramFalso = Awaited<ReturnType<typeof criarTelegramFalso>>;

export async function criarTelegramFalso() {
  const token = `123:teste-${randomUUID()}`;
  const chamadas: ChamadaTelegram[] = [];
  const fila: unknown[] = [];
  const estado = { fora: false, proximoId: 1000 };

  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const [, bot, metodo] = url.pathname.split("/");
    if (estado.fora) return json(res, 502, { ok: false, error_code: 502, description: "Bad Gateway" });
    if (bot !== `bot${token}`) return json(res, 401, { ok: false, error_code: 401, description: "Unauthorized" });
    const corpo = (await lerCorpo(req)) as Record<string, unknown>;
    chamadas.push({ metodo, corpo });
    switch (metodo) {
      case "getUpdates": {
        // Simplificação: cada atualização é entregue uma vez só (o Telegram real a descarta quando o
        // próximo getUpdates confirma o offset).
        const pendentes = fila.splice(0);
        return json(res, 200, { ok: true, result: pendentes });
      }
      case "sendMessage":
        estado.proximoId += 1;
        return json(res, 200, {
          ok: true,
          result: { message_id: estado.proximoId, chat: { id: Number(corpo.chat_id) }, text: corpo.text },
        });
      case "editMessageText":
      case "answerCallbackQuery":
        return json(res, 200, { ok: true, result: true });
      default:
        return json(res, 404, { ok: false, error_code: 404, description: "Not Found" });
    }
  });

  const base = await ouvir(servidor);
  let proximoUpdate = 1;

  return {
    base,
    token,
    chamadas,
    estado,
    de: (metodo: string) => chamadas.filter((c) => c.metodo === metodo),
    limpar: () => chamadas.splice(0),
    /** Põe uma atualização na fila do getUpdates. */
    enfileirar(u: Record<string, unknown>) {
      fila.push({ update_id: proximoUpdate++, ...u });
    },
    fechar: () =>
      new Promise<void>((resolve) => {
        servidor.closeAllConnections();
        servidor.close(() => resolve());
      }),
  };
}

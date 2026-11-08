// Paperclip falso para o E2E da tela Aprovações (spec 006). Roda num container na rede asttra
// (scripts/teste-e2e.sh), sem dependências. Segue o contrato conferido em scripts/teste-paperclip.sh:
// 422 na decisão oposta, 200 sem mudar nada ao repetir e 401 com a chave errada.
// Rota extra só para o teste: POST /teste/pedidos cria um pedido pendente.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const CHAVE = process.env.CHAVE;
const EMPRESA = process.env.EMPRESA;
if (!CHAVE || !EMPRESA) throw new Error("defina CHAVE e EMPRESA");
const pedidos = new Map();

function json(res, status, corpo) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(corpo));
}

async function corpoDe(req) {
  let bruto = "";
  for await (const parte of req) bruto += parte;
  try {
    return bruto ? JSON.parse(bruto) : {};
  } catch {
    return {};
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/saude") return json(res, 200, { ok: true });
  if (req.headers.authorization !== `Bearer ${CHAVE}`) return json(res, 401, { error: "Unauthorized" });
  const p = url.pathname.split("/").filter(Boolean);

  if (req.method === "POST" && url.pathname === "/teste/pedidos") {
    const { payload = {} } = await corpoDe(req);
    const agora = new Date().toISOString();
    const pedido = {
      id: randomUUID(),
      companyId: EMPRESA,
      type: "request_board_approval",
      status: "pending",
      payload,
      requestedByAgentId: null,
      requestedByUserId: "board",
      decisionNote: null,
      decidedByUserId: null,
      decidedAt: null,
      createdAt: agora,
      updatedAt: agora,
    };
    pedidos.set(pedido.id, pedido);
    return json(res, 201, pedido);
  }
  if (req.method === "GET" && p[1] === "companies" && p[2] === EMPRESA && p[3] === "approvals") {
    const status = url.searchParams.get("status");
    return json(
      res,
      200,
      [...pedidos.values()].filter((x) => !status || x.status === status),
    );
  }
  if (req.method === "GET" && p[1] === "companies" && p[3] === "agents") return json(res, 200, []);
  if (p[1] === "approvals" && pedidos.has(p[2])) {
    const pedido = pedidos.get(p[2]);
    if (req.method === "GET" && p.length === 3) return json(res, 200, pedido);
    if (req.method === "POST" && (p[3] === "approve" || p[3] === "reject")) {
      const { decisionNote = null } = await corpoDe(req);
      const alvo = p[3] === "approve" ? "approved" : "rejected";
      if (pedido.status !== "pending") {
        return pedido.status === alvo ? json(res, 200, pedido) : json(res, 422, { error: "already decided" });
      }
      const agora = new Date().toISOString();
      Object.assign(pedido, { status: alvo, decisionNote, decidedAt: agora, updatedAt: agora, decidedByUserId: "u" });
      return json(res, 200, pedido);
    }
  }
  json(res, 404, { error: "not found" });
}).listen(3100, "0.0.0.0", () => console.log("paperclip falso na porta 3100"));

import type { ConfigPaperclip } from "../env";

// Cliente mínimo da API do Paperclip para as aprovações (spec 006). Contrato conferido na versão
// fixa por scripts/teste-paperclip.sh. A chave de board vai só no cabeçalho e nunca nas mensagens
// de erro.

export const TEMPO_LIMITE_MS = 5000;

export type Decisao = "approved" | "rejected";

export type Aprovacao = {
  id: string;
  companyId: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
  requestedByAgentId: string | null;
  requestedByUserId: string | null;
  decisionNote: string | null;
  decidedByUserId: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ErroPaperclip = { tipo: "chave" | "fora_do_ar" | "nao_encontrado" | "inesperado"; mensagem: string };

export type ResultadoDecisaoPaperclip =
  | { ok: true; aprovacao: Aprovacao }
  | { ok: false; jaDecidido: true; aprovacao: Aprovacao }
  | { ok: false; jaDecidido?: false; erro: ErroPaperclip };

type Resposta = { status: number; corpo: unknown } | { erro: ErroPaperclip };

/** Traduz o status HTTP num erro com texto para a tela (sem detalhes da resposta). */
export function erroDoStatus(status: number): ErroPaperclip {
  if (status === 401 || status === 403) {
    return { tipo: "chave", mensagem: "O Paperclip recusou a chave do painel (PAPERCLIP_CHAVE_BOARD)." };
  }
  if (status === 404) return { tipo: "nao_encontrado", mensagem: "Pedido não encontrado no Paperclip." };
  if (status >= 500) return { tipo: "fora_do_ar", mensagem: `O Paperclip respondeu com erro (${status}).` };
  return { tipo: "inesperado", mensagem: `Resposta inesperada do Paperclip (${status}).` };
}

async function chamar(
  config: ConfigPaperclip,
  metodo: "GET" | "POST",
  caminho: string,
  corpo?: unknown,
): Promise<Resposta> {
  const cabecalhos: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${config.chave}`,
  };
  if (corpo !== undefined) cabecalhos["content-type"] = "application/json";
  let r: Response;
  try {
    r = await fetch(`${config.url}/api${caminho}`, {
      method: metodo,
      headers: cabecalhos,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(config.tempoLimiteMs ?? TEMPO_LIMITE_MS),
      cache: "no-store",
    });
  } catch (e) {
    const tempo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      erro: {
        tipo: "fora_do_ar",
        mensagem: tempo ? "O Paperclip não respondeu a tempo." : "Não consegui falar com o Paperclip.",
      },
    };
  }
  let dados: unknown = null;
  try {
    dados = await r.json();
  } catch {
    dados = null;
  }
  return { status: r.status, corpo: dados };
}

function ehAprovacao(v: unknown): v is Aprovacao {
  return typeof v === "object" && v !== null && typeof (v as Aprovacao).id === "string";
}

function normalizar(a: Aprovacao): Aprovacao {
  const payload = a.payload && typeof a.payload === "object" && !Array.isArray(a.payload) ? a.payload : {};
  return { ...a, payload };
}

/** Pedidos da empresa com o status dado, do mais antigo para o mais novo. */
export async function listarAprovacoes(
  config: ConfigPaperclip,
  status: string,
): Promise<{ ok: true; aprovacoes: Aprovacao[] } | { ok: false; erro: ErroPaperclip }> {
  const r = await chamar(
    config,
    "GET",
    `/companies/${encodeURIComponent(config.empresaId)}/approvals?status=${encodeURIComponent(status)}`,
  );
  if ("erro" in r) return { ok: false, erro: r.erro };
  if (r.status !== 200) return { ok: false, erro: erroDoStatus(r.status) };
  if (!Array.isArray(r.corpo)) return { ok: false, erro: erroDoStatus(r.status) };
  const lista = r.corpo.filter(ehAprovacao).map(normalizar);
  lista.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { ok: true, aprovacoes: lista };
}

export async function verAprovacao(
  config: ConfigPaperclip,
  id: string,
): Promise<{ ok: true; aprovacao: Aprovacao } | { ok: false; erro: ErroPaperclip }> {
  const r = await chamar(config, "GET", `/approvals/${encodeURIComponent(id)}`);
  if ("erro" in r) return { ok: false, erro: r.erro };
  if (r.status !== 200 || !ehAprovacao(r.corpo)) return { ok: false, erro: erroDoStatus(r.status) };
  return { ok: true, aprovacao: normalizar(r.corpo) };
}

/**
 * Aprova ou recusa. Um pedido já decidido do outro jeito responde 422: aí o pedido é lido de novo e
 * volta como `jaDecidido`. Repetir a mesma decisão devolve 200 sem mudar nada (quem chama confere o
 * status antes, ver aprovacoes/servico.ts).
 */
export async function decidir(
  config: ConfigPaperclip,
  id: string,
  decisao: Decisao,
  motivo?: string | null,
): Promise<ResultadoDecisaoPaperclip> {
  const acao = decisao === "approved" ? "approve" : "reject";
  const r = await chamar(config, "POST", `/approvals/${encodeURIComponent(id)}/${acao}`, {
    decisionNote: motivo?.trim() || null,
  });
  if ("erro" in r) return { ok: false, erro: r.erro };
  if (r.status === 200 && ehAprovacao(r.corpo)) return { ok: true, aprovacao: normalizar(r.corpo) };
  if (r.status === 422) {
    const atual = await verAprovacao(config, id);
    if (!atual.ok) return { ok: false, erro: atual.erro };
    return { ok: false, jaDecidido: true, aprovacao: atual.aprovacao };
  }
  return { ok: false, erro: erroDoStatus(r.status) };
}

/** Nome de cada agente da empresa, pelo id. Se falhar, devolve um mapa vazio (a tela mostra o id). */
export async function nomesDosAgentes(config: ConfigPaperclip): Promise<Map<string, string>> {
  const r = await chamar(config, "GET", `/companies/${encodeURIComponent(config.empresaId)}/agents`);
  const mapa = new Map<string, string>();
  if ("erro" in r || r.status !== 200 || !Array.isArray(r.corpo)) return mapa;
  for (const a of r.corpo as { id?: unknown; name?: unknown }[]) {
    if (typeof a.id === "string" && typeof a.name === "string") mapa.set(a.id, a.name);
  }
  return mapa;
}

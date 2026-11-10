import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getAtividades } from "@/app/api/v1/atividades/route";
import { GET as getAvisos } from "@/app/api/v1/avisos/route";
import { GET as getDepartamentos } from "@/app/api/v1/departamentos/route";
import { POST as postTarefas } from "@/app/api/v1/tarefas/route";
import { registrar } from "../atividades/servico";
import { criar as criarAviso, resolver as resolverAviso } from "../avisos/servico";
import { banco } from "../db/client";
import { atividades, departamentos } from "../db/schema";
import { criarChave, ESCOPOS, gerarChave, revogarChave } from "./chaves";

// Rotas /api/v1 (spec 007), chamadas como o Next as chamaria, contra o PostgreSQL de teste.

const URL_BASE = "http://painel:3000/api/v1";

let completa: string;
let revogada: string;
let soDepartamentos: string;

beforeAll(async () => {
  completa = (await criarChave("hermes", [...ESCOPOS])).chave;
  const r = await criarChave("hermes", [...ESCOPOS]);
  await revogarChave(r.id);
  revogada = r.chave;
  soDepartamentos = (await criarChave("so-departamentos", ["departamentos:ler"])).chave;
});

afterAll(async () => {
  await banco().$client.end();
});

function pedido(caminho: string, chave?: string, corpo?: unknown): Request {
  const headers = new Headers();
  if (chave) headers.set("authorization", `Bearer ${chave}`);
  if (corpo !== undefined) headers.set("content-type", "application/json");
  return new Request(`${URL_BASE}${caminho}`, {
    method: corpo === undefined ? "GET" : "POST",
    headers,
    body: corpo === undefined ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

async function tarefasRegistradas(id: string) {
  return banco()
    .select()
    .from(atividades)
    .where(and(eq(atividades.acao, "tarefa_criada"), eq(atividades.alvo, `paperclip:${id}`)));
}

let contador = 0;
const rotas = [
  { nome: "GET /departamentos", chamar: (c?: string) => getDepartamentos(pedido("/departamentos", c)), escopo: false },
  { nome: "GET /atividades", chamar: (c?: string) => getAtividades(pedido("/atividades", c)), escopo: true },
  { nome: "GET /avisos", chamar: (c?: string) => getAvisos(pedido("/avisos", c)), escopo: true },
  {
    nome: "POST /tarefas",
    chamar: (c?: string) => postTarefas(pedido("/tarefas", c, { id: `T-${Date.now()}-${++contador}`, titulo: "T" })),
    escopo: true,
  },
];

describe.each(rotas)("$nome: chave", ({ chamar, escopo }) => {
  it("sem chave, desconhecida ou revogada: 401 sem motivo", async () => {
    for (const chave of [undefined, gerarChave(), revogada, "qualquer-coisa"]) {
      const r = await chamar(chave);
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ erro: "nao_autorizado" });
      expect(r.headers.get("cache-control")).toBe("no-store");
    }
  });

  it.runIf(escopo)("chave sem o escopo: 403", async () => {
    const r = await chamar(soDepartamentos);
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ erro: "sem_permissao" });
  });

  it("chave com o escopo: 2xx", async () => {
    const r = await chamar(completa);
    expect([200, 201]).toContain(r.status);
  });
});

describe("rotas de leitura", () => {
  it("departamentos na ordem do menu, só slug, nome e áreas", async () => {
    const r = await getDepartamentos(pedido("/departamentos", completa));
    const lista = (await r.json()) as { slug: string; nome: string; areas: string[] }[];
    expect(lista.map((d) => d.slug)).toEqual(["crescimento", "entrega", "clientes", "administracao", "direcao"]);
    expect(Object.keys(lista[0]).sort()).toEqual(["areas", "nome", "slug"]);
  });

  it("atividades: mais novas primeiro, sem detalhes, padrão 20 e máximo 50", async () => {
    for (let i = 0; i < 55; i++) {
      await registrar({ autorTipo: "agente", autorId: "n8n", acao: "teste_api", detalhes: { segredo: "nao-sai" } });
    }
    await registrar({ autorTipo: "agente", autorId: "hermes", acao: "teste_api_ultima", alvo: "x:1" });

    const padrao = (await (await getAtividades(pedido("/atividades", completa))).json()) as Record<string, unknown>[];
    expect(padrao).toHaveLength(20);
    expect(padrao[0]).toMatchObject({ autor: "hermes", acao: "teste_api_ultima", alvo: "x:1", departamento: null });
    expect(Object.keys(padrao[0]).sort()).toEqual(["acao", "alvo", "autor", "departamento", "quando"]);
    expect(JSON.stringify(padrao)).not.toContain("nao-sai");

    const tamanho = async (q: string) =>
      ((await (await getAtividades(pedido(`/atividades?limite=${q}`, completa))).json()) as unknown[]).length;
    expect(await tamanho("5")).toBe(5);
    expect(await tamanho("500")).toBe(50);
    expect(await tamanho("abc")).toBe(20);
  });

  it("avisos: só os abertos, com tipo, mensagem, origem e criado_em", async () => {
    const aberto = await criarAviso("alerta", "Aviso aberto da API", "teste-api");
    const fechado = await criarAviso("erro", "Aviso resolvido da API", "teste-api");
    await resolverAviso(fechado.id, { id: "usuario-teste" });

    const lista = (await (await getAvisos(pedido("/avisos", completa))).json()) as Record<string, unknown>[];
    const meu = lista.find((a) => a.mensagem === aberto.mensagem);
    expect(meu).toMatchObject({ tipo: "alerta", origem: "teste-api" });
    expect(Object.keys(meu ?? {}).sort()).toEqual(["criado_em", "mensagem", "origem", "tipo"]);
    expect(lista.some((a) => a.mensagem === fechado.mensagem)).toBe(false);
  });
});

describe("POST /tarefas", () => {
  it("grava tarefa_criada com o agente da chave e o departamento sem acento", async () => {
    const id = `AST-${Date.now()}`;
    const r = await postTarefas(
      pedido("/tarefas", completa, {
        id,
        titulo: "Emitir nota",
        departamento: "ADMINISTRACAO",
        link: `https://agentes.teste/issues/${id}`,
        // O autor nunca vem do corpo.
        autorId: "outro",
      }),
    );
    expect(r.status).toBe(201);
    const [adm] = await banco().select().from(departamentos).where(eq(departamentos.slug, "administracao"));
    const registros = await tarefasRegistradas(id);
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({
      autorTipo: "agente",
      autorId: "hermes",
      departamentoId: adm.id,
      detalhes: { titulo: "Emitir nota", link: `https://agentes.teste/issues/${id}` },
    });
  });

  it("o mesmo id não grava de novo e responde 200, mesmo em pedidos simultâneos", async () => {
    const id = `AST-REP-${Date.now()}`;
    const corpo = { id, titulo: "Repetida", departamento: "Crescimento" };
    const respostas = await Promise.all([1, 2, 3].map(() => postTarefas(pedido("/tarefas", completa, corpo))));
    expect(respostas.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect(await tarefasRegistradas(id)).toHaveLength(1);
  });

  it("departamento desconhecido grava sem departamento", async () => {
    const id = `AST-SEM-${Date.now()}`;
    const r = await postTarefas(pedido("/tarefas", completa, { id, titulo: "Sem dep", departamento: "Vendas" }));
    expect(r.status).toBe(201);
    const [registro] = await tarefasRegistradas(id);
    expect(registro.departamentoId).toBeNull();
  });

  it.each([
    ["sem id", { titulo: "X" }],
    ["sem título", { id: "AST-INV-1" }],
    ["id inválido", { id: "AST/../1", titulo: "X" }],
    ["título longo", { id: "AST-INV-2", titulo: "a".repeat(301) }],
    ["link sem http", { id: "AST-INV-3", titulo: "X", link: "ftp://x" }],
    ["JSON quebrado", "{isso nao e json"],
  ])("corpo inválido (%s): 400 sem gravar", async (_, corpo) => {
    const antes = await banco().$count(atividades, eq(atividades.acao, "tarefa_criada"));
    const r = await postTarefas(pedido("/tarefas", completa, corpo));
    expect(r.status).toBe(400);
    expect(await banco().$count(atividades, eq(atividades.acao, "tarefa_criada"))).toBe(antes);
  });
});

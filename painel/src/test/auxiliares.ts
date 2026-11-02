import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { auth } from "../core/auth/auth";
import { criarUsuario } from "../core/auth/usuarios";
import { banco } from "../core/db/client";
import { atividades } from "../core/db/schema";

// Auxiliares dos testes de integração: chamam o Better Auth como o navegador chamaria.

export const URL_BASE = "http://localhost:3000";
/** Senha descartável, gerada a cada execução (nada parecido com segredo fica no código). */
export function senhaAleatoria(): string {
  return `teste-${randomUUID()}`;
}

export const SENHA = senhaAleatoria();

let contadorIp = 0;
/** Um IP diferente por teste, para o limite de tentativas de um não afetar o outro. */
export function ipNovo(): string {
  contadorIp += 1;
  return `203.0.113.${(contadorIp % 250) + 1}`;
}

export async function usuarioNovo(senha = SENHA) {
  const email = `teste-${randomUUID()}@exemplo.com`;
  const u = await criarUsuario({ email, nome: "Teste", senha });
  return { ...u, senha };
}

export async function pedir(
  caminho: string,
  opcoes: { metodo?: "GET" | "POST"; corpo?: unknown; ip?: string; cookie?: string } = {},
): Promise<Response> {
  const cabecalhos = new Headers({ origin: URL_BASE });
  if (opcoes.corpo !== undefined) cabecalhos.set("content-type", "application/json");
  if (opcoes.ip) cabecalhos.set("cf-connecting-ip", opcoes.ip);
  if (opcoes.cookie) cabecalhos.set("cookie", opcoes.cookie);
  return auth().handler(
    new Request(`${URL_BASE}/api/auth${caminho}`, {
      method: opcoes.metodo ?? (opcoes.corpo === undefined ? "GET" : "POST"),
      headers: cabecalhos,
      body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
    }),
  );
}

export function entrar(email: string, senha: string, ip = ipNovo()) {
  return pedir("/sign-in/email", { corpo: { email, password: senha }, ip });
}

/** O Set-Cookie da sessão (com atributos) e o par nome=valor para mandar de volta. */
export function cookieDaSessao(resposta: Response): { bruto: string; cookie: string } {
  const bruto = resposta.headers.getSetCookie().find((c) => c.includes("better-auth.session_token="));
  if (!bruto) throw new Error("Resposta sem cookie de sessão");
  return { bruto, cookie: bruto.split(";")[0] };
}

export async function entrarECookie(email: string, senha = SENHA) {
  const r = await entrar(email, senha);
  if (r.status !== 200) throw new Error(`Login falhou: ${r.status}`);
  return cookieDaSessao(r).cookie;
}

export async function sessaoDoCookie(cookie: string) {
  const r = await pedir("/get-session", { cookie });
  return (await r.json()) as { user: { id: string } } | null;
}

export async function atividadesDe(autorId: string, acao: string) {
  return banco()
    .select()
    .from(atividades)
    .where(and(eq(atividades.autorId, autorId), eq(atividades.acao, acao)));
}

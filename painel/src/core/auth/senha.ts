import { hash, verify } from "@node-rs/argon2";

// Hash de senha com argon2id (ADR 0004). Os parâmetros padrão do @node-rs/argon2 já são argon2id
// com 19 MiB de memória, 2 iterações e paralelismo 1, a recomendação mínima da OWASP.

export { problemaNaSenha, SENHA_MAXIMO, SENHA_MINIMO } from "./senha-regras";

export function hashSenha(senha: string): Promise<string> {
  return hash(senha);
}

export async function verificarSenha({ hash: h, password }: { hash: string; password: string }): Promise<boolean> {
  try {
    return await verify(h, password);
  } catch {
    // Hash em formato desconhecido: trata como senha errada, sem detalhar o motivo.
    return false;
  }
}

import { z } from "zod";

// Variáveis de ambiente do painel. Nada da Asttra fica fixo no código: nome, URL e segredos vêm daqui.
// A leitura é preguiçosa para o `next build` não exigir o .env.
const esquema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET precisa de pelo menos 32 caracteres"),
  BETTER_AUTH_URL: z.string().url(),
  PAINEL_NOME: z.string().min(1).default("Painel"),
  SESSAO_DIAS: z.coerce.number().int().min(1).max(30).default(1),
});

export type Env = z.infer<typeof esquema>;

let cache: Env | undefined;

export function env(): Env {
  if (!cache) {
    const resultado = esquema.safeParse(process.env);
    if (!resultado.success) {
      const campos = resultado.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      throw new Error(`Variáveis de ambiente inválidas:\n${campos.join("\n")}`);
    }
    cache = resultado.data;
  }
  return cache;
}

/** Só a URL do banco, para scripts que não precisam do resto (migração e seed). */
export function urlDoBanco(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  return url;
}

/** Nome do painel, sem exigir as outras variáveis (usado em telas públicas). */
export function nomeDoPainel(): string {
  return process.env.PAINEL_NOME?.trim() || "Painel";
}

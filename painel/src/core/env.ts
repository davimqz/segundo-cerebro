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

export type ConfigPaperclip = { url: string; empresaId: string; chave: string; tempoLimiteMs?: number };

/**
 * Conexão do painel com o Paperclip para as aprovações (spec 006). As três variáveis são opcionais:
 * sem alguma delas, devolve null e a tela Aprovações diz que não está configurada.
 */
export function aprovacoesConfiguradas(): ConfigPaperclip | null {
  const url = process.env.PAPERCLIP_URL?.trim();
  const empresaId = process.env.PAPERCLIP_EMPRESA_ID?.trim();
  const chave = process.env.PAPERCLIP_CHAVE_BOARD?.trim();
  if (!url || !empresaId || !chave) return null;
  return { url: url.replace(/\/+$/, ""), empresaId, chave };
}

export type ConfigTelegramAprovacoes = { token: string; chatId: string };

/** O bot de aprovações do Telegram. Só o ID numérico de TELEGRAM_APROVACOES_CHAT_ID é aceito. */
export function telegramAprovacoes(): ConfigTelegramAprovacoes | null {
  const token = process.env.TELEGRAM_APROVACOES_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_APROVACOES_CHAT_ID?.trim();
  if (!token || !chatId || !/^-?\d+$/.test(chatId)) return null;
  return { token, chatId };
}

/** Endereço público do painel, para os links das mensagens (vazio se não houver). */
export function urlDoPainel(): string {
  return (process.env.BETTER_AUTH_URL ?? "").trim().replace(/\/+$/, "");
}

/** Nome do painel, sem exigir as outras variáveis (usado em telas públicas). */
export function nomeDoPainel(): string {
  return process.env.PAINEL_NOME?.trim() || "Painel";
}

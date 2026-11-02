import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { registrar } from "../atividades/servico";
import { banco } from "../db/client";
import { tabelasDoLogin } from "../db/schema";
import { env } from "../env";
import { hashSenha, SENHA_MAXIMO, SENHA_MINIMO, verificarSenha } from "./senha";

// Login do painel (ADR 0004). Só existe login por e-mail e senha, sem cadastro público.

/** Janela e máximo do limite de tentativas de login, por IP. */
export const LIMITE_LOGIN = { janelaSegundos: 15 * 60, maximo: 5 };

/** Rotas do Better Auth que o painel não usa e ficam desligadas (respondem 404). */
const ROTAS_DESLIGADAS = [
  "/sign-up/email",
  "/update-user",
  "/change-email",
  "/delete-user",
  "/request-password-reset",
  "/reset-password",
  "/send-verification-email",
  "/verify-email",
];

function criarAuth() {
  const e = env();
  return betterAuth({
    appName: e.PAINEL_NOME,
    baseURL: e.BETTER_AUTH_URL,
    secret: e.BETTER_AUTH_SECRET,
    database: drizzleAdapter(banco(), { provider: "pg", schema: tabelasDoLogin }),
    // Nada sai do servidor sem aprovação: a telemetria fica desligada.
    telemetry: { enabled: false },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: SENHA_MINIMO,
      maxPasswordLength: SENHA_MAXIMO,
      revokeSessionsOnPasswordReset: true,
      password: { hash: hashSenha, verify: verificarSenha },
    },
    disabledPaths: ROTAS_DESLIGADAS,
    session: {
      // A sessão dura SESSAO_DIAS desde o login e não é renovada pelo uso.
      expiresIn: e.SESSAO_DIAS * 24 * 60 * 60,
      disableSessionRefresh: true,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: {
        "/sign-in/email": { window: LIMITE_LOGIN.janelaSegundos, max: LIMITE_LOGIN.maximo },
      },
    },
    advanced: {
      // O painel só é alcançado pelo Cloudflare Tunnel, que informa o IP real neste cabeçalho.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      useSecureCookies: true,
      defaultCookieAttributes: { httpOnly: true, secure: true, sameSite: "lax" },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-out") {
          const sessao = await getSessionFromCtx(ctx).catch(() => null);
          if (sessao) await registrar({ autorTipo: "usuario", autorId: sessao.user.id, acao: "logout" });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.context.returned instanceof APIError) return;
        if (ctx.path === "/sign-in/email" && ctx.context.newSession) {
          await registrar({
            autorTipo: "usuario",
            autorId: ctx.context.newSession.user.id,
            acao: "login",
            detalhes: { ip: ctx.context.newSession.session.ipAddress ?? null },
          });
        }
        if (ctx.path === "/change-password" && ctx.context.session) {
          await registrar({ autorTipo: "usuario", autorId: ctx.context.session.user.id, acao: "senha_trocada" });
        }
      }),
    },
  });
}

export type Auth = ReturnType<typeof criarAuth>;

const global = globalThis as unknown as { __authPainel?: Auth };

/** Instância única do Better Auth por processo, criada no primeiro uso. */
export function auth(): Auth {
  if (!global.__authPainel) global.__authPainel = criarAuth();
  return global.__authPainel;
}

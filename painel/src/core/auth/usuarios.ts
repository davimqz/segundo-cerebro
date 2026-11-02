import { registrar } from "../atividades/servico";
import { auth } from "./auth";
import { hashSenha, problemaNaSenha } from "./senha";

// Gestão de usuários pela linha de comando (scripts/usuario.ts). Não existe cadastro pela tela.

const ORIGEM = "script:usuario";

function normalizarEmail(email: string): string {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error("E-mail inválido.");
  return e;
}

function conferirSenha(senha: string) {
  const problema = problemaNaSenha(senha);
  if (problema) throw new Error(problema);
}

export async function criarUsuario({ email, nome, senha }: { email: string; nome: string; senha: string }) {
  const e = normalizarEmail(email);
  conferirSenha(senha);
  const ctx = await auth().$context;
  if (await ctx.internalAdapter.findUserByEmail(e)) throw new Error("Já existe um usuário com esse e-mail.");

  const usuario = await ctx.internalAdapter.createUser(
    { email: e, name: nome.trim() || e.split("@")[0], emailVerified: true },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: usuario.id,
    providerId: "credential",
    accountId: usuario.id,
    password: await hashSenha(senha),
  });
  await registrar({ autorTipo: "sistema", autorId: ORIGEM, acao: "usuario_criado", alvo: `usuario:${usuario.id}` });
  return usuario;
}

/** Troca a senha e encerra todas as sessões do usuário. */
export async function trocarSenha({ email, senha }: { email: string; senha: string }) {
  const e = normalizarEmail(email);
  conferirSenha(senha);
  const ctx = await auth().$context;
  const achado = await ctx.internalAdapter.findUserByEmail(e, { includeAccounts: true });
  if (!achado) throw new Error("Usuário não encontrado.");

  const hash = await hashSenha(senha);
  const credencial = achado.accounts.find((a) => a.providerId === "credential");
  if (credencial) {
    await ctx.internalAdapter.updatePassword(achado.user.id, hash);
  } else {
    await ctx.internalAdapter.linkAccount({
      userId: achado.user.id,
      providerId: "credential",
      accountId: achado.user.id,
      password: hash,
    });
  }
  await ctx.internalAdapter.deleteUserSessions(achado.user.id);
  await registrar({ autorTipo: "sistema", autorId: ORIGEM, acao: "senha_trocada", alvo: `usuario:${achado.user.id}` });
  return achado.user;
}

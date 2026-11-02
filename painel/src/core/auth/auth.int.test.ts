import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  atividadesDe,
  cookieDaSessao,
  entrar,
  entrarECookie,
  ipNovo,
  pedir,
  SENHA,
  senhaAleatoria,
  sessaoDoCookie,
  usuarioNovo,
} from "../../test/auxiliares";
import { banco } from "../db/client";
import { contas, sessoes, usuarios } from "../db/schema";
import { LIMITE_LOGIN } from "./auth";
import { trocarSenha } from "./usuarios";

const ERRADA = senhaAleatoria();

afterAll(async () => {
  await banco().$client.end();
});

describe("login", () => {
  it("com e-mail e senha certos cria a sessão, com cookie seguro, e grava login", async () => {
    const u = await usuarioNovo();
    const r = await entrar(u.email, SENHA);
    expect(r.status).toBe(200);

    const { bruto, cookie } = cookieDaSessao(r);
    expect(bruto).toMatch(/HttpOnly/i);
    expect(bruto).toMatch(/Secure/i);
    expect(bruto).toMatch(/SameSite=Lax/i);

    expect((await sessaoDoCookie(cookie))?.user.id).toBe(u.id);
    expect(await atividadesDe(u.id, "login")).toHaveLength(1);
  });

  it("guarda a senha com hash argon2id", async () => {
    const u = await usuarioNovo();
    const [conta] = await banco().select().from(contas).where(eq(contas.userId, u.id));
    expect(conta.password).toMatch(/^\$argon2id\$/);
    expect(conta.password).not.toContain(SENHA);
  });

  it("responde igual para e-mail inexistente e senha errada, sem criar sessão", async () => {
    const u = await usuarioNovo();
    const senhaErrada = await entrar(u.email, ERRADA);
    const emailInexistente = await entrar("ninguem@exemplo.com", ERRADA);

    expect(senhaErrada.status).toBe(401);
    expect(emailInexistente.status).toBe(401);
    expect(await senhaErrada.json()).toEqual(await emailInexistente.json());
    expect(senhaErrada.headers.getSetCookie().some((c) => c.includes("session_token="))).toBe(false);
    expect(await banco().select().from(sessoes).where(eq(sessoes.userId, u.id))).toHaveLength(0);
  });

  it(`responde 429 depois de ${LIMITE_LOGIN.maximo} erros do mesmo IP, sem afetar outro IP`, async () => {
    const u = await usuarioNovo();
    const ip = ipNovo();
    for (let i = 0; i < LIMITE_LOGIN.maximo; i++) {
      expect((await entrar(u.email, ERRADA, ip)).status).toBe(401);
    }
    expect((await entrar(u.email, SENHA, ip)).status).toBe(429);
    expect((await entrar(u.email, SENHA, ipNovo())).status).toBe(200);
  });

  it("recusa o cadastro público", async () => {
    const r = await pedir("/sign-up/email", {
      corpo: { email: "novo@exemplo.com", password: senhaAleatoria(), name: "Novo" },
      ip: ipNovo(),
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(await banco().select().from(usuarios).where(eq(usuarios.email, "novo@exemplo.com"))).toHaveLength(0);
  });
});

describe("sessão", () => {
  it("expira depois de SESSAO_DIAS e pede a senha de novo", async () => {
    const u = await usuarioNovo();
    const cookie = await entrarECookie(u.email);

    const [s] = await banco().select().from(sessoes).where(eq(sessoes.userId, u.id));
    const dias = (s.expiresAt.getTime() - s.createdAt.getTime()) / 86_400_000;
    expect(Math.round(dias)).toBe(1);

    // Usar a sessão não a renova.
    await sessaoDoCookie(cookie);
    const [depois] = await banco().select().from(sessoes).where(eq(sessoes.userId, u.id));
    expect(depois.expiresAt.getTime()).toBe(s.expiresAt.getTime());

    await banco()
      .update(sessoes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessoes.userId, u.id));
    expect(await sessaoDoCookie(cookie)).toBeNull();
  });

  it("sair apaga a sessão no banco, limpa o cookie e grava logout", async () => {
    const u = await usuarioNovo();
    const cookie = await entrarECookie(u.email);

    const r = await pedir("/sign-out", { metodo: "POST", corpo: {}, cookie });
    expect(r.status).toBe(200);
    const limpo = r.headers.getSetCookie().find((c) => c.includes("session_token="));
    expect(limpo).toMatch(/Max-Age=0/i);

    expect(await banco().select().from(sessoes).where(eq(sessoes.userId, u.id))).toHaveLength(0);
    expect(await sessaoDoCookie(cookie)).toBeNull();
    expect(await atividadesDe(u.id, "logout")).toHaveLength(1);
  });

  it("trocar a senha na tela encerra as outras sessões e grava senha_trocada", async () => {
    const u = await usuarioNovo();
    const cookieA = await entrarECookie(u.email);
    const cookieB = await entrarECookie(u.email);

    const nova = senhaAleatoria();
    const r = await pedir("/change-password", {
      corpo: { currentPassword: SENHA, newPassword: nova, revokeOtherSessions: true },
      cookie: cookieA,
    });
    expect(r.status).toBe(200);

    expect(await sessaoDoCookie(cookieB)).toBeNull();
    expect(await atividadesDe(u.id, "senha_trocada")).toHaveLength(1);
    expect((await entrar(u.email, nova)).status).toBe(200);
  });

  it("trocar a senha com a senha atual errada é recusado", async () => {
    const u = await usuarioNovo();
    const cookie = await entrarECookie(u.email);
    const r = await pedir("/change-password", {
      corpo: { currentPassword: ERRADA, newPassword: senhaAleatoria() },
      cookie,
    });
    expect(r.status).toBe(400);
    expect((await entrar(u.email, SENHA)).status).toBe(200);
  });
});

describe("pnpm usuario senha", () => {
  it("troca a senha e encerra todas as sessões", async () => {
    const u = await usuarioNovo();
    const cookie = await entrarECookie(u.email);

    const nova = senhaAleatoria();
    await trocarSenha({ email: u.email, senha: nova });

    expect(await banco().select().from(sessoes).where(eq(sessoes.userId, u.id))).toHaveLength(0);
    expect(await sessaoDoCookie(cookie)).toBeNull();
    expect((await entrar(u.email, SENHA)).status).toBe(401);
    expect((await entrar(u.email, nova)).status).toBe(200);
  });

  it("recusa senha com menos de 12 caracteres", async () => {
    const u = await usuarioNovo();
    await expect(trocarSenha({ email: u.email, senha: "curta" })).rejects.toThrow(/12 caracteres/);
  });
});

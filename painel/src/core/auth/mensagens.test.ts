import { describe, expect, it } from "vitest";
import { MENSAGEM_CREDENCIAIS, MENSAGEM_LIMITE, mensagemDoLogin } from "./mensagens";
import { problemaNaSenha } from "./senha-regras";

describe("mensagemDoLogin", () => {
  it("usa a mesma mensagem genérica para e-mail inexistente e senha errada", () => {
    // O Better Auth responde 401 nos dois casos; e-mail mal formatado vem como 400.
    expect(mensagemDoLogin(401)).toBe("E-mail ou senha incorretos");
    expect(mensagemDoLogin(400)).toBe(MENSAGEM_CREDENCIAIS);
    expect(mensagemDoLogin(403)).toBe(MENSAGEM_CREDENCIAIS);
  });

  it("avisa do limite de tentativas no 429", () => {
    expect(mensagemDoLogin(429)).toBe(MENSAGEM_LIMITE);
  });

  it("não expõe detalhes em outros erros", () => {
    expect(mensagemDoLogin(500)).not.toMatch(/senha|e-mail/i);
    expect(mensagemDoLogin(undefined)).not.toMatch(/senha|e-mail/i);
  });
});

describe("problemaNaSenha", () => {
  it("exige no mínimo 12 caracteres", () => {
    expect(problemaNaSenha("curta")).toMatch(/12 caracteres/);
    expect(problemaNaSenha("a".repeat(11))).not.toBeNull();
    expect(problemaNaSenha("a".repeat(12))).toBeNull();
  });
});

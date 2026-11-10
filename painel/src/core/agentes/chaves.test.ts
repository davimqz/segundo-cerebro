import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { chaveDoCabecalho, ehEscopo, gerarChave, hashDaChave, PREFIXO } from "./chaves";

describe("chaves de agente", () => {
  it("gera 32 bytes aleatórios com o prefixo pnl_", () => {
    const a = gerarChave();
    const b = gerarChave();
    expect(a.startsWith(PREFIXO)).toBe(true);
    expect(Buffer.from(a.slice(PREFIXO.length), "base64url")).toHaveLength(32);
    expect(a).not.toBe(b);
  });

  it("o hash é o SHA-256 em hexadecimal, sem a chave dentro", () => {
    const chave = gerarChave();
    const hash = hashDaChave(chave);
    expect(hash).toBe(createHash("sha256").update(chave).digest("hex"));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(chave.slice(PREFIXO.length, 12));
  });

  it("só aceita os escopos conhecidos", () => {
    expect(ehEscopo("avisos:ler")).toBe(true);
    expect(ehEscopo("tarefas:registrar")).toBe(true);
    expect(ehEscopo("avisos:gravar")).toBe(false);
    expect(ehEscopo(undefined)).toBe(false);
  });

  it("lê a chave só de 'Bearer <chave>' no formato certo", () => {
    const chave = gerarChave();
    expect(chaveDoCabecalho(`Bearer ${chave}`)).toBe(chave);
    expect(chaveDoCabecalho(`bearer ${chave}`)).toBe(chave);
    expect(chaveDoCabecalho(null)).toBeNull();
    expect(chaveDoCabecalho(chave)).toBeNull();
    expect(chaveDoCabecalho("Bearer pnl_curta")).toBeNull();
    expect(chaveDoCabecalho(`Bearer ${chave.replace("pnl_", "pcp_")}`)).toBeNull();
    expect(chaveDoCabecalho(`Basic ${chave}`)).toBeNull();
  });
});

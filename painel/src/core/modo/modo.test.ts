import { describe, expect, it } from "vitest";
import { cookieDoModo, lerModo } from "./modo";

describe("lerModo", () => {
  it("aceita claro, escuro e sistema", () => {
    expect(lerModo("claro")).toBe("claro");
    expect(lerModo("escuro")).toBe("escuro");
    expect(lerModo("sistema")).toBe("sistema");
  });

  it("segue o sistema quando não há preferência salva ou o valor é desconhecido", () => {
    expect(lerModo(undefined)).toBe("sistema");
    expect(lerModo(null)).toBe("sistema");
    expect(lerModo("")).toBe("sistema");
    expect(lerModo("dark")).toBe("sistema");
    expect(lerModo('escuro"><script>')).toBe("sistema");
  });
});

describe("cookieDoModo", () => {
  it("grava o modo por um ano, no site todo", () => {
    expect(cookieDoModo("escuro")).toBe("modo=escuro; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
  });
});

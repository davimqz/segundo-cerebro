import { describe, expect, it } from "vitest";
import { argumentos } from "./terminal";

describe("argumentos", () => {
  it("separa o comando das opções --nome valor e --nome=valor", () => {
    expect(argumentos(["criar", "--tipo", "erro", "--mensagem=Banco fora", "--", "--origem", "x"])).toEqual({
      posicionais: ["criar"],
      opcoes: { tipo: "erro", mensagem: "Banco fora", origem: "x" },
    });
  });
});

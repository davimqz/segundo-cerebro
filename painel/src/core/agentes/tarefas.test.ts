import { describe, expect, it } from "vitest";
import { esquemaTarefa, normalizar } from "./tarefas";

describe("corpo de POST /api/v1/tarefas", () => {
  const valido = { id: "AST-12", titulo: "Proposta", departamento: "Crescimento", link: "https://x.test/AST-12" };

  it("aceita o corpo completo e o mínimo (id e título)", () => {
    expect(esquemaTarefa.safeParse(valido).success).toBe(true);
    expect(esquemaTarefa.safeParse({ id: "AST-1", titulo: "X" }).success).toBe(true);
  });

  it.each([
    ["sem id", { ...valido, id: undefined }],
    ["sem título", { ...valido, titulo: undefined }],
    ["título vazio", { ...valido, titulo: "   " }],
    ["id com barra", { ...valido, id: "../agents" }],
    ["id com espaço", { ...valido, id: "AST 1" }],
    ["id longo demais", { ...valido, id: "a".repeat(65) }],
    ["título acima de 300", { ...valido, titulo: "a".repeat(301) }],
    ["link sem http", { ...valido, link: "javascript:alert(1)" }],
    ["link file", { ...valido, link: "file:///etc/passwd" }],
  ])("recusa %s", (_, corpo) => {
    expect(esquemaTarefa.safeParse(corpo).success).toBe(false);
  });
});

describe("normalizar", () => {
  it("ignora maiúsculas, acentos e espaços extras", () => {
    expect(normalizar("Administração")).toBe("administracao");
    expect(normalizar("  ADMINISTRACAO ")).toBe("administracao");
    expect(normalizar("Direção")).toBe(normalizar("direcao"));
    expect(normalizar("Crescimento  Rápido")).toBe("crescimento rapido");
  });
});

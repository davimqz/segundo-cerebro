import { afterEach, describe, expect, it, vi } from "vitest";

// Banco fora do ar: a conferência da chave falha antes de a rota rodar.
vi.mock("./chaves", () => ({
  autenticar: vi.fn(async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
  }),
}));

const { rotaDeAgente } = await import("./rota");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rotaDeAgente", () => {
  it("banco fora do ar: 503 sem detalhes e sem a chave no log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const chave = `pnl_${"a".repeat(43)}`;
    const rota = rotaDeAgente("avisos:ler", async () => Response.json({}));

    const r = await rota(
      new Request("http://painel:3000/api/v1/avisos", { headers: { authorization: `Bearer ${chave}` } }),
    );

    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ erro: "indisponivel" });
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain(chave);
  });
});

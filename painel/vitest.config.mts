import { randomBytes } from "node:crypto";
import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(import.meta.dirname, "src") };

// Dois grupos de teste:
// - unidade: rápidos, sem banco (arquivo.test.ts);
// - integracao: contra um PostgreSQL descartável (arquivo.int.test.ts), apontado por DATABASE_URL.
//   O globalSetup zera o banco, roda as migrações e a seed. Use scripts/teste-painel.sh.
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unidade",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: ["**/*.int.test.ts", "node_modules/**"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integracao",
          include: ["src/**/*.int.test.ts"],
          environment: "node",
          globalSetup: ["./src/test/preparar-banco.ts"],
          // Os arquivos compartilham o mesmo banco: um de cada vez.
          fileParallelism: false,
          testTimeout: 20000,
          hookTimeout: 60000,
          env: {
            // Gerado a cada execução: nenhum valor com cara de segredo fica no código.
            BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
            BETTER_AUTH_URL: "http://localhost:3000",
            PAINEL_NOME: "Painel de Teste",
            SESSAO_DIAS: "1",
          },
        },
      },
    ],
  },
});

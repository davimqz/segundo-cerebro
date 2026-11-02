// Roda as migrações e a seed. No container, roda antes do servidor abrir (ver Dockerfile).
// Uso: pnpm db:migrar
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { criarBanco } from "../src/core/db/client";
import { semear } from "../src/core/db/seed";
import { urlDoBanco } from "../src/core/env";

async function main() {
  const db = criarBanco(urlDoBanco(), 1);
  try {
    const pasta = process.env.MIGRACOES_DIR ?? path.resolve("drizzle");
    await migrate(db, { migrationsFolder: pasta });
    await semear(db);
    console.log("Migrações e seed aplicadas.");
  } finally {
    await db.$client.end();
  }
}

main().catch((erro) => {
  console.error("Falha nas migrações:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});

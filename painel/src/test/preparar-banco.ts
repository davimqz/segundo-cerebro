import path from "node:path";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { criarBanco } from "../core/db/client";
import { semear } from "../core/db/seed";

// Antes dos testes de integração: zera o banco de teste e aplica migrações e seed do zero,
// como acontece num servidor novo. Recusa rodar num banco que não pareça de teste.
export default async function prepararBanco() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida. Rode os testes de integração por scripts/teste-painel.sh.");
  if (!/teste/i.test(new URL(url).pathname)) {
    throw new Error("Por segurança, o banco dos testes de integração precisa ter 'teste' no nome.");
  }

  const db = criarBanco(url, 1);
  try {
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`create schema public`);
    await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
    await semear(db);
  } finally {
    await db.$client.end();
  }
}

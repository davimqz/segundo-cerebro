import { defineConfig } from "drizzle-kit";

// `pnpm db:gerar` cria uma migração nova a partir do schema. Nunca edite uma migração já aplicada.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/core/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
});

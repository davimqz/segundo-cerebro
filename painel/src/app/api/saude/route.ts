import { sql } from "drizzle-orm";
import { banco } from "@/core/db/client";

export const dynamic = "force-dynamic";

// Usada pelo healthcheck do container. Não revela detalhes do erro.
export async function GET() {
  try {
    await banco().execute(sql`select 1`);
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (erro) {
    console.error("Saúde: banco indisponível", erro);
    return Response.json({ status: "erro" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

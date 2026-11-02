import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { urlDoBanco } from "../env";
import * as schema from "./schema";

export type Banco = NodePgDatabase<typeof schema> & { $client: Pool };

/** Cria uma conexão nova. Usado pelos scripts e pelos testes, que fecham o pool ao terminar. */
export function criarBanco(url: string, max = 10): Banco {
  const pool = new Pool({ connectionString: url, max });
  return drizzle(pool, { schema }) as Banco;
}

// Uma conexão por processo do servidor, guardada no globalThis para o hot reload do `next dev`
// não abrir um pool novo a cada edição.
const global = globalThis as unknown as { __bancoPainel?: Banco };

export function banco(): Banco {
  if (!global.__bancoPainel) global.__bancoPainel = criarBanco(urlDoBanco());
  return global.__bancoPainel;
}

/** Fecha a conexão do processo, se ela chegou a ser aberta (usado pelos scripts ao terminar). */
export async function fecharBanco(): Promise<void> {
  const b = global.__bancoPainel;
  global.__bancoPainel = undefined;
  if (b) await b.$client.end();
}

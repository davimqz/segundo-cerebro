import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";

export type UsuarioDaSessao = { id: string; nome: string; email: string };

/** Lê a sessão do pedido atual (uma vez por renderização). Devolve null se não houver. */
export const sessaoAtual = cache(async (): Promise<UsuarioDaSessao | null> => {
  const s = await auth().api.getSession({ headers: await headers() });
  if (!s) return null;
  return { id: s.user.id, nome: s.user.name, email: s.user.email };
});

/**
 * Exige sessão válida. Use no layout das telas e no início de toda Server Action:
 * sem sessão, redireciona para /entrar. É a checagem que vale; a do proxy.ts só adianta o redirect.
 */
export async function exigirSessao(): Promise<UsuarioDaSessao> {
  const usuario = await sessaoAtual();
  if (!usuario) redirect("/entrar");
  return usuario;
}

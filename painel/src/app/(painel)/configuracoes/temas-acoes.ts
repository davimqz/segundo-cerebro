"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessao } from "@/core/auth/sessao";
import { ativarTema, instalarTema, TAMANHO_MAXIMO, type ResultadoTema } from "@/core/temas/servico";

/**
 * Instala o tokens.json enviado como tema inativo. A própria ação confere a sessão (sem sessão,
 * redireciona para /entrar) e recusa arquivo grande antes de ler o conteúdo.
 */
export async function carregarTema(formData: FormData): Promise<ResultadoTema> {
  const usuario = await exigirSessao();
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, erros: ["Escolha um arquivo tokens.json"] };
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return { ok: false, erros: [`O arquivo passa de ${TAMANHO_MAXIMO / 1024} KB`] };
  }
  const r = await instalarTema(await arquivo.text(), usuario);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

const esquemaAtivar = z.object({ id: z.coerce.number().int().positive() });

/** Ativa um tema instalado. As cores mudam no próximo carregamento de cada tela. */
export async function ativarTemaAcao(formData: FormData): Promise<ResultadoTema> {
  const usuario = await exigirSessao();
  const r = esquemaAtivar.safeParse({ id: formData.get("id") });
  if (!r.success) return { ok: false, erros: ["Tema não encontrado"] };
  const resultado = await ativarTema(r.data.id, usuario);
  if (resultado.ok) revalidatePath("/", "layout");
  return resultado;
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessao } from "@/core/auth/sessao";
import { resolver } from "@/core/avisos/servico";

const esquemaResolver = z.object({ id: z.coerce.number().int().positive() });

/** Resolve um aviso aberto. A própria ação confere a sessão; não confia na tela. */
export async function resolverAviso(formData: FormData): Promise<void> {
  const usuario = await exigirSessao();
  const r = esquemaResolver.safeParse({ id: formData.get("id") });
  if (!r.success) return;
  await resolver(r.data.id, usuario);
  revalidatePath("/", "layout");
}

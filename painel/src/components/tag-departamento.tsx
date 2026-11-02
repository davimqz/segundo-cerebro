import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Tag de departamento: o nome escrito na cor do departamento (token tag-<slug> do tema), fundo da
 * mesma cor a 10% e borda de 1px. Sem o token, cai no texto secundário.
 */
export function TagDepartamento({ slug, nome, className }: { slug: string; nome: string; className?: string }) {
  return (
    <span
      style={{ "--cor": `var(--t-tag-${slug}, var(--t-text-muted))` } as CSSProperties}
      className={cn("rotulo inline-block rounded-xs border border-cor bg-cor/10 px-2 py-[3px] text-cor", className)}
    >
      {nome}
    </span>
  );
}

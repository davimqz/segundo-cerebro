import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { COOKIE_MODO, lerModo } from "@/core/modo/modo";
import { BotaoModo } from "./botao-modo";

/** Cabeçalho de cada tela: rótulo, título em duas partes (como no Selecta) e o botão de modo. */
export async function CabecalhoDaTela({
  rotulo,
  titulo,
  complemento,
  acoes,
}: {
  rotulo?: string;
  titulo: string;
  complemento?: string;
  acoes?: ReactNode;
}) {
  const modo = lerModo((await cookies()).get(COOKIE_MODO)?.value);
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2">
        {rotulo && <span className="rotulo text-text-muted">{rotulo}</span>}
        <h1 className="m-0 text-2xl font-medium tracking-[-0.03em]">
          {titulo}
          {complemento && <span className="text-title-muted"> {complemento}</span>}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <BotaoModo inicial={modo} />
        {acoes}
      </div>
    </header>
  );
}

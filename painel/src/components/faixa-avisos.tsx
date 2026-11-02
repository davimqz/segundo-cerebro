import { CircleAlert, TriangleAlert } from "lucide-react";
import type { CSSProperties } from "react";
import { resolverAviso } from "@/app/(painel)/acoes";
import type { Aviso } from "@/core/avisos/servico";

const ESTILO = {
  alerta: { token: "var(--t-status-warning)", rotulo: "Aviso", Icone: TriangleAlert },
  erro: { token: "var(--t-status-danger)", rotulo: "Erro", Icone: CircleAlert },
} as const;

/** Faixa no topo de todas as telas com os avisos abertos. Cor sempre acompanhada de ícone e texto. */
export function FaixaAvisos({ avisos }: { avisos: Aviso[] }) {
  if (!avisos.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {avisos.map((aviso) => {
        const { token, rotulo, Icone } = ESTILO[aviso.tipo];
        return (
          <div
            key={aviso.id}
            role={aviso.tipo === "erro" ? "alert" : "status"}
            data-testid="aviso"
            style={{ "--cor": token } as CSSProperties}
            className="flex flex-wrap items-center gap-3 rounded-xs border border-cor bg-cor/10 px-4 py-3"
          >
            <span className="rotulo flex items-center gap-1.5 text-cor">
              <Icone className="size-4" aria-hidden />
              {rotulo}
            </span>
            <span className="min-w-0 flex-[1_1_320px]">{aviso.mensagem}</span>
            <form action={resolverAviso}>
              <input type="hidden" name="id" value={aviso.id} />
              <button type="submit" className="font-medium underline-offset-2 hover:underline">
                Resolver
              </button>
            </form>
          </div>
        );
      })}
    </div>
  );
}

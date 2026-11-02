import { BarraLateral } from "@/components/barra-lateral";
import { FaixaAvisos } from "@/components/faixa-avisos";
import { exigirSessao } from "@/core/auth/sessao";
import { abertos } from "@/core/avisos/servico";
import { nomeDoPainel } from "@/core/env";

// Casca das telas logadas. A sessão é conferida aqui, no servidor, a cada pedido.
export default async function LayoutDoPainel({ children }: LayoutProps<"/">) {
  await exigirSessao();
  const avisos = await abertos();

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <BarraLateral nomePainel={nomeDoPainel()} />
      <main className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-6 md:px-10 md:pt-8 md:pb-12">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
          <FaixaAvisos avisos={avisos} />
          {children}
        </div>
      </main>
    </div>
  );
}

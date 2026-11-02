import Link from "next/link";
import { CabecalhoDaTela } from "@/components/cabecalho-da-tela";
import { exigirSessao } from "@/core/auth/sessao";
import { nomeDoPainel } from "@/core/env";
import { cn } from "@/lib/utils";

export const metadata = { title: "Início" };

// Os valores entre colchetes são provisórios: os indicadores calculados chegam na Etapa 2, item 2.
const INDICADORES = [
  { rotulo: "Leads novos", valor: "[0]", legenda: "nesta semana" },
  { rotulo: "Propostas abertas", valor: "[0]", legenda: "aguardando resposta" },
  { rotulo: "Tarefas atrasadas", valor: "[0]", legenda: "passaram do prazo", cor: "text-status-danger" },
  { rotulo: "Aprovações", valor: "[0]", legenda: "esperando você", cor: "text-status-warning" },
  { rotulo: "Conteúdos", valor: "[0]", legenda: "publicados na semana" },
];

function Bloco({
  id,
  titulo,
  verTodas,
  className,
  children,
}: {
  id: string;
  titulo: string;
  verTodas?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn("min-w-0 border border-border", className)}>
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <h2 id={id} className="m-0 text-base font-medium">
          {titulo}
        </h2>
        {verTodas && (
          <Link href={verTodas} className="text-[13px] text-text-muted hover:opacity-70">
            Ver todas
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="m-0 px-5 py-4 text-text-muted">{children}</p>;
}

export default async function Inicio() {
  await exigirSessao();
  const hoje = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <>
      <CabecalhoDaTela rotulo={hoje} titulo="Visão geral" complemento={`de ${nomeDoPainel()} hoje`} />

      <section
        aria-label="Indicadores"
        className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] border-t border-l border-border"
      >
        {INDICADORES.map((i) => (
          <div key={i.rotulo} className="flex flex-col gap-2 border-r border-b border-border px-5 py-4">
            <span className="rotulo text-text-muted">{i.rotulo}</span>
            <span className={cn("numeros-tabulares text-[28px] font-medium tracking-[-0.02em]", i.cor)}>{i.valor}</span>
            <span className="text-[13px] text-text-muted">{i.legenda}</span>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <Bloco id="aprovacoes-titulo" titulo="Aprovações pendentes" verTodas="/aprovacoes" className="flex-[3_1_480px]">
          <Vazio>Nenhuma aprovação pendente. As aprovações chegam na Etapa 1, item 5.</Vazio>
        </Bloco>
        <Bloco id="agenda-titulo" titulo="Próximos compromissos" className="flex-[2_1_300px]">
          <Vazio>Nenhum compromisso. A agenda chega na Etapa 1, item 8.</Vazio>
        </Bloco>
      </div>

      <Bloco id="tarefas-titulo" titulo="Tarefas de hoje" verTodas="/tarefas">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="rotulo text-left text-text-muted">
                {["Tarefa", "Departamento", "Responsável", "Status"].map((c) => (
                  <th key={c} scope="col" className="border-b border-border px-5 py-2.5 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={4} className="px-5 py-3 text-text-muted">
                  Nenhuma tarefa para hoje. As tarefas chegam na Etapa 1, item 5.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Bloco>
    </>
  );
}

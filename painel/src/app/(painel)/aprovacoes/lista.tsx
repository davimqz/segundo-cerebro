"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { aprovar, recusar, type RespostaDaAcao } from "./acoes";

export type PedidoNaTela = {
  id: string;
  titulo: string;
  tipo: string;
  descricao: string | null;
  campos: { campo: string; valor: string }[];
  solicitante: string;
  criadoEm: string;
};

export type DecididoNaTela = {
  id: string;
  titulo: string;
  status: string;
  decisao: string;
  motivo: string | null;
  quando: string;
  onde: string;
};

/** Relê a tela no servidor a cada `segundos` (só com a aba visível). Também atualiza a faixa de avisos. */
export function AtualizarSozinho({ segundos }: { segundos: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, segundos * 1000);
    return () => clearInterval(t);
  }, [router, segundos]);
  return null;
}

function Pedido({ p, aoDecidir }: { p: PedidoNaTela; aoDecidir: (r: RespostaDaAcao, titulo: string) => void }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  function concluir(r: RespostaDaAcao) {
    if (r.tipo === "erro") {
      setErro(r.mensagem);
      return;
    }
    setErro(null);
    aoDecidir(r, p.titulo);
    router.refresh();
  }

  function aprovarPedido() {
    iniciar(async () => concluir(await aprovar(p.id)));
  }

  function enviarRecusa(e: FormEvent) {
    e.preventDefault();
    if (!motivo.trim()) {
      setErro("Escreva o motivo da recusa.");
      return;
    }
    iniciar(async () => concluir(await recusar(p.id, motivo)));
  }

  const idMotivo = `motivo-${p.id}`;
  return (
    <li
      id={`pedido-${p.id}`}
      data-testid="pendente"
      aria-label={p.titulo}
      className="flex flex-col gap-3 border-b border-border px-5 py-4 last:border-b-0"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
          <span className="rotulo text-text-muted">{p.tipo}</span>
          <span className="font-medium">{p.titulo}</span>
          <span className="text-[13px] text-text-muted">
            Pedido por {p.solicitante} · {p.criadoEm}
          </span>
        </div>
        {!recusando && (
          <div className="flex items-center gap-2">
            <Button variant="primario" disabled={pendente} onClick={aprovarPedido}>
              Aprovar<span className="sr-only"> {p.titulo}</span>
            </Button>
            <Button
              disabled={pendente}
              onClick={() => {
                setErro(null);
                setRecusando(true);
              }}
            >
              Recusar<span className="sr-only"> {p.titulo}</span>
            </Button>
          </div>
        )}
      </div>

      {p.descricao && <p className="m-0 whitespace-pre-wrap">{p.descricao}</p>}
      {p.campos.length > 0 && (
        <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[13px]">
          {p.campos.map((c) => (
            <div key={c.campo} className="contents">
              <dt className="font-mono text-text-muted">{c.campo}:</dt>
              <dd className="m-0 min-w-0 break-words">{c.valor}</dd>
            </div>
          ))}
        </dl>
      )}

      {recusando && (
        <form onSubmit={enviarRecusa} className="flex flex-col gap-2" aria-label={`Recusar ${p.titulo}`}>
          <Label htmlFor={idMotivo}>Motivo da recusa</Label>
          <textarea
            id={idMotivo}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={1000}
            rows={3}
            required
            aria-invalid={erro ? true : undefined}
            className="w-full rounded-xs border border-border-strong bg-surface px-3 py-2 text-text placeholder:text-text-muted aria-invalid:border-status-danger"
          />
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primario" disabled={pendente}>
              Confirmar recusa
            </Button>
            <Button
              variant="fantasma"
              disabled={pendente}
              onClick={() => {
                setRecusando(false);
                setErro(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {erro && (
        <p role="alert" className="m-0 text-status-danger">
          {erro}
        </p>
      )}
    </li>
  );
}

export function ListaDePendentes({ pedidos }: { pedidos: PedidoNaTela[] }) {
  const [mensagem, setMensagem] = useState<{ tipo: RespostaDaAcao["tipo"]; texto: string } | null>(null);

  return (
    <section aria-labelledby="titulo-pendentes" className="flex flex-col gap-3">
      <h2 id="titulo-pendentes" className="rotulo m-0 font-normal text-text-muted">
        Pendentes ({pedidos.length})
      </h2>
      {mensagem && (
        <p
          role="status"
          className={`m-0 ${mensagem.tipo === "ja_decidido" ? "text-status-warning" : "text-status-success"}`}
        >
          {mensagem.texto}
        </p>
      )}
      {pedidos.length === 0 ? (
        <div className="border border-border px-5 py-4 text-text-muted">Nenhum pedido esperando decisão.</div>
      ) : (
        <ul aria-label="Pedidos pendentes" className="m-0 flex list-none flex-col border border-border p-0">
          {pedidos.map((p) => (
            <Pedido
              key={p.id}
              p={p}
              aoDecidir={(r, titulo) => setMensagem({ tipo: r.tipo, texto: `${titulo}: ${r.mensagem}` })}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { ItemDaLista, ResultadoTema } from "@/core/temas/servico";
import { ativarTemaAcao, carregarTema } from "./temas-acoes";

// Fuso fixo: o servidor (container em UTC) e o navegador mostram a mesma data.
const formatoData = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

type Mensagem = { tipo: "ok"; texto: string; avisos: string[] } | { tipo: "erro"; erros: string[] };

function deResultado(r: ResultadoTema, textoOk: string): Mensagem {
  return r.ok ? { tipo: "ok", texto: textoOk, avisos: r.avisos ?? [] } : { tipo: "erro", erros: r.erros };
}

function Retorno({ mensagem }: { mensagem: Mensagem | null }) {
  if (!mensagem) return null;
  if (mensagem.tipo === "erro") {
    return (
      <div role="alert" className="flex flex-col gap-1 text-status-danger">
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {mensagem.erros.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div role="status" className="flex flex-col gap-1">
      <p className="m-0 text-status-success">{mensagem.texto}</p>
      {mensagem.avisos.map((a) => (
        <p key={a} className="m-0 text-[13px] text-status-warning">
          {a}
        </p>
      ))}
    </div>
  );
}

function Marca({ children }: { children: string }) {
  return <span className="rotulo rounded-xs border border-border-strong px-2 py-[3px] text-text">{children}</span>;
}

export function ListaDeTemas({ temas }: { temas: ItemDaLista[] }) {
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const [pendente, iniciar] = useTransition();

  function ativar(id: number, nome: string) {
    const dados = new FormData();
    dados.set("id", String(id));
    iniciar(async () => setMensagem(deResultado(await ativarTemaAcao(dados), `Tema "${nome}" ativado`)));
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="rotulo text-text-muted">Temas instalados</span>
      <ul aria-label="Temas instalados" className="m-0 flex list-none flex-col border border-border p-0">
        {temas.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-medium">{t.nome}</span>
              <span className="text-[13px] text-text-muted">Instalado em {formatoData.format(t.criadoEm)}</span>
            </div>
            <div className="flex items-center gap-2">
              {t.ativo && <Marca>Ativo</Marca>}
              {t.padrao && <Marca>Padrão</Marca>}
              {!t.ativo && (
                <Button size="pequeno" disabled={pendente} onClick={() => ativar(t.id, t.nome)}>
                  Ativar<span className="sr-only"> o tema {t.nome}</span>
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Retorno mensagem={mensagem} />
    </div>
  );
}

export function FormCarregarTema() {
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const [pendente, iniciar] = useTransition();

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const dados = new FormData(form);
    iniciar(async () => {
      const r = await carregarTema(dados);
      if (r.ok) form.reset();
      setMensagem(deResultado(r, "Tema instalado"));
    });
  }

  return (
    <form onSubmit={enviar} className="flex max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="arquivo">Carregar tema (tokens.json)</Label>
        <Input
          id="arquivo"
          name="arquivo"
          type="file"
          accept=".json,application/json"
          required
          className="h-auto py-1.5 file:mr-3 file:border-0 file:bg-transparent file:font-medium file:text-text"
        />
        <span className="text-[13px] text-text-muted">O tema entra inativo. Até 256 KB.</span>
      </div>
      <Retorno mensagem={mensagem} />
      <div>
        <Button type="submit" variant="primario" disabled={pendente}>
          {pendente ? "Carregando..." : "Carregar tema"}
        </Button>
      </div>
    </form>
  );
}

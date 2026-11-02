"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { MENU } from "./menu";

function ativa(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function Marca({ nome }: { nome: string }) {
  return (
    <div className="flex items-center gap-2 px-2">
      <span aria-hidden className="text-lg font-medium tracking-[-0.03em]">
        {nome.charAt(0).toUpperCase()}.
      </span>
      <span className="text-[15px] font-medium tracking-[-0.01em]">{nome}</span>
    </div>
  );
}

/** Barra lateral fixa no computador; no celular vira um menu que abre por cima. */
export function BarraLateral({ nomePainel }: { nomePainel: string }) {
  const pathname = usePathname();
  // Guarda em qual tela o menu do celular foi aberto: ao navegar, ele fecha sozinho.
  const [abertoEm, setAbertoEm] = useState<string | null>(null);
  const aberto = abertoEm === pathname;

  const navegacao = (
    <nav aria-label="Menu principal" className="flex flex-col gap-6">
      {MENU.map((grupo) => (
        <div key={grupo.nome} className="flex flex-col gap-1">
          <span className="rotulo px-2 pb-1 text-text-muted">{grupo.nome}</span>
          {grupo.telas.map((t) => {
            const atual = ativa(pathname, t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={atual ? "page" : undefined}
                className={cn(
                  "rounded-xs border p-2 hover:opacity-70",
                  atual ? "border-border bg-surface font-medium" : "border-transparent",
                )}
              >
                {t.nome}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Celular */}
      <div className="flex items-center justify-between border-b border-border bg-surface-subtle px-4 py-3 md:hidden">
        <Marca nome={nomePainel} />
        <button
          type="button"
          onClick={() => setAbertoEm(aberto ? null : pathname)}
          aria-expanded={aberto}
          aria-controls="menu-celular"
          aria-label={aberto ? "Fechar menu" : "Abrir menu"}
          className="flex size-9 items-center justify-center rounded-xs border border-border-strong"
        >
          {aberto ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
        </button>
      </div>
      {aberto && (
        <div id="menu-celular" className="border-b border-border bg-surface-subtle px-4 py-4 md:hidden">
          {navegacao}
        </div>
      )}

      {/* Computador */}
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col gap-6 overflow-y-auto border-r border-border bg-surface-subtle px-4 py-6 md:flex">
        <Marca nome={nomePainel} />
        {navegacao}
      </aside>
    </>
  );
}

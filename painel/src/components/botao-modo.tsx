"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Modo } from "@/core/modo/modo";
import { useModo } from "./usar-modo";

/** Botão do topo: troca entre claro e escuro a partir do modo que está na tela. */
export function BotaoModo({ inicial }: { inicial: Modo }) {
  const { efetivo, escolher } = useModo(inicial);
  const proximo = efetivo === "escuro" ? "claro" : "escuro";
  return (
    <Button onClick={() => escolher(proximo)} aria-label={`Usar modo ${proximo}`} data-testid="botao-modo">
      {efetivo === "escuro" ? <Sun aria-hidden /> : <Moon aria-hidden />}
      <span>Modo {proximo}</span>
    </Button>
  );
}

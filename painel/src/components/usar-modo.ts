"use client";

import { useCallback, useSyncExternalStore } from "react";
import { cookieDoModo, lerModo, type Modo } from "@/core/modo/modo";

// O modo vive no atributo data-modo do <html> (desenhado pelo servidor a partir do cookie).
// Trocar o modo grava o cookie e muda o atributo na hora, sem recarregar.

const ouvintes = new Set<() => void>();

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  const midia = window.matchMedia("(prefers-color-scheme: dark)");
  midia.addEventListener("change", ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
    midia.removeEventListener("change", ouvinte);
  };
}

function modoAtual(): Modo {
  return lerModo(document.documentElement.dataset.modo);
}

/** "claro" ou "escuro" de fato, resolvendo "sistema" pela preferência do sistema operacional. */
export function modoEfetivo(modo: Modo): "claro" | "escuro" {
  if (modo !== "sistema") return modo;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

/** `inicial` é o modo do cookie, lido pelo servidor, para a primeira renderização já sair certa. */
export function useModo(inicial: Modo = "sistema") {
  const modo = useSyncExternalStore(assinar, modoAtual, () => inicial);
  const efetivo = useSyncExternalStore(
    assinar,
    () => modoEfetivo(modoAtual()),
    () => (inicial === "escuro" ? "escuro" : "claro"),
  );

  const escolher = useCallback((novo: Modo) => {
    document.cookie = cookieDoModo(novo);
    document.documentElement.dataset.modo = novo;
    ouvintes.forEach((o) => o());
  }, []);

  return { modo, efetivo, escolher };
}

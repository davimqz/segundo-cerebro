"use client";

// Erro genérico para o usuário. O detalhe fica só no log do servidor.
export default function Erro({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4">
      <h1 className="m-0 text-2xl font-medium tracking-[-0.03em]">Algo deu errado.</h1>
      <p className="m-0 text-text-muted">Tente de novo. Se continuar, avise quem cuida do painel.</p>
      <button type="button" onClick={reset} className="h-9 rounded-xs border border-border-strong px-3.5 font-medium">
        Tentar de novo
      </button>
    </main>
  );
}

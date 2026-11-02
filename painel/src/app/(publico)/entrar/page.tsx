import { redirect } from "next/navigation";
import { Suspense } from "react";
import { sessaoAtual } from "@/core/auth/sessao";
import { nomeDoPainel } from "@/core/env";
import { FormEntrar } from "./form-entrar";

export const metadata = { title: "Entrar" };

export default async function Entrar() {
  if (await sessaoAtual()) redirect("/");
  const nome = nomeDoPainel();

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6 border border-border px-6 py-8">
        <div className="flex flex-col gap-2">
          <span className="rotulo text-text-muted">{nome}</span>
          <h1 className="m-0 text-2xl font-medium tracking-[-0.03em]">
            Entrar <span className="text-title-muted">no painel</span>
          </h1>
        </div>
        <Suspense>
          <FormEntrar />
        </Suspense>
      </div>
    </main>
  );
}

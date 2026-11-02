"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { authCliente } from "@/core/auth/cliente";
import { mensagemDoLogin } from "@/core/auth/mensagens";

/** Só aceita caminhos internos (evita redirecionar para outro site depois do login). */
function destinoSeguro(voltar: string | null): string {
  return voltar && voltar.startsWith("/") && !voltar.startsWith("//") && !voltar.startsWith("/\\") ? voltar : "/";
}

export function FormEntrar() {
  const router = useRouter();
  const busca = useSearchParams();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    setEnviando(true);
    setErro(null);
    const { error } = await authCliente.signIn.email({
      email: String(dados.get("email") ?? "").trim(),
      password: String(dados.get("senha") ?? ""),
    });
    if (error) {
      setEnviando(false);
      setErro(mensagemDoLogin(error.status));
      return;
    }
    router.replace(destinoSeguro(busca.get("voltar")));
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="senha">Senha</Label>
        <Input id="senha" name="senha" type="password" autoComplete="current-password" required />
      </div>
      {erro && (
        <p role="alert" className="m-0 text-status-danger">
          {erro}
        </p>
      )}
      <Button type="submit" variant="primario" disabled={enviando}>
        {enviando ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}

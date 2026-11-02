"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useModo } from "@/components/usar-modo";
import { authCliente } from "@/core/auth/cliente";
import { problemaNaSenha } from "@/core/auth/senha-regras";
import { MODOS, ROTULO_MODO, type Modo } from "@/core/modo/modo";

export function SeletorDeModo({ inicial }: { inicial: Modo }) {
  const { modo, escolher } = useModo(inicial);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="rotulo mb-2 text-text-muted">Modo</legend>
      <div className="flex flex-wrap gap-2">
        {MODOS.map((m) => (
          <label
            key={m}
            className="flex h-9 cursor-pointer items-center gap-2 rounded-xs border border-border-strong px-3 has-checked:border-text has-checked:font-medium"
          >
            <input
              type="radio"
              name="modo"
              value={m}
              checked={modo === m}
              onChange={() => escolher(m)}
              className="accent-current"
            />
            {ROTULO_MODO[m]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function FormTrocarSenha() {
  const [estado, setEstado] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const dados = new FormData(form);
    const atual = String(dados.get("atual") ?? "");
    const nova = String(dados.get("nova") ?? "");
    const confirmacao = String(dados.get("confirmacao") ?? "");

    const problema =
      problemaNaSenha(nova) ?? (nova !== confirmacao ? "A confirmação não bate com a nova senha." : null);
    if (problema) return setEstado({ tipo: "erro", texto: problema });

    setEnviando(true);
    const { error } = await authCliente.changePassword({
      currentPassword: atual,
      newPassword: nova,
      revokeOtherSessions: true,
    });
    setEnviando(false);
    if (error) {
      setEstado({
        tipo: "erro",
        texto: error.status === 400 ? "A senha atual está incorreta." : "Não foi possível trocar a senha agora.",
      });
      return;
    }
    form.reset();
    setEstado({ tipo: "ok", texto: "Senha trocada. As outras sessões foram encerradas." });
  }

  return (
    <form onSubmit={enviar} className="flex max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="atual">Senha atual</Label>
        <Input id="atual" name="atual" type="password" autoComplete="current-password" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nova">Nova senha</Label>
        <Input id="nova" name="nova" type="password" autoComplete="new-password" minLength={12} required />
        <span className="text-[13px] text-text-muted">Pelo menos 12 caracteres.</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmacao">Confirme a nova senha</Label>
        <Input id="confirmacao" name="confirmacao" type="password" autoComplete="new-password" required />
      </div>
      {estado && (
        <p
          role={estado.tipo === "erro" ? "alert" : "status"}
          className={estado.tipo === "erro" ? "m-0 text-status-danger" : "m-0 text-status-success"}
        >
          {estado.texto}
        </p>
      )}
      <div>
        <Button type="submit" variant="primario" disabled={enviando}>
          {enviando ? "Trocando..." : "Trocar senha"}
        </Button>
      </div>
    </form>
  );
}

export function BotaoSair() {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);
  async function sair() {
    setSaindo(true);
    await authCliente.signOut();
    router.replace("/entrar");
    router.refresh();
  }
  return (
    <Button onClick={sair} disabled={saindo}>
      <LogOut aria-hidden />
      {saindo ? "Saindo..." : "Sair"}
    </Button>
  );
}

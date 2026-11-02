import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { CabecalhoDaTela } from "@/components/cabecalho-da-tela";
import { exigirSessao } from "@/core/auth/sessao";
import { COOKIE_MODO, lerModo } from "@/core/modo/modo";
import { temaAtivo } from "@/core/temas/servico";
import { BotaoSair, FormTrocarSenha, SeletorDeModo } from "./conta";

export const metadata = { title: "Configurações" };

function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border border-border">
      <div className="border-b border-border px-5 py-3.5">
        <h2 id={id} className="m-0 text-base font-medium">
          {titulo}
        </h2>
      </div>
      <div className="flex flex-col gap-5 px-5 py-5">{children}</div>
    </section>
  );
}

export default async function Configuracoes() {
  const usuario = await exigirSessao();
  const [loja, ativo] = await Promise.all([cookies(), temaAtivo()]);
  const modo = lerModo(loja.get(COOKIE_MODO)?.value);

  return (
    <>
      <CabecalhoDaTela titulo="Configurações" complemento="do painel" />

      <Secao id="aparencia" titulo="Aparência">
        <div className="flex flex-col gap-1">
          <span className="rotulo text-text-muted">Tema ativo</span>
          <span data-testid="tema-ativo">{ativo.nome}</span>
          <span className="text-[13px] text-text-muted">Carregar e trocar temas chega na Etapa 1, item 4.</span>
        </div>
        <SeletorDeModo inicial={modo} />
        <p className="m-0 text-[13px] text-text-muted">A escolha vale só neste aparelho.</p>
      </Secao>

      <Secao id="conta" titulo="Conta">
        <div className="flex flex-col gap-1">
          <span className="rotulo text-text-muted">Entrou como</span>
          <span>
            {usuario.nome} · {usuario.email}
          </span>
        </div>
        <FormTrocarSenha />
        <div className="border-t border-border pt-5">
          <BotaoSair />
        </div>
      </Secao>
    </>
  );
}

import { exigirSessao } from "@/core/auth/sessao";
import { CabecalhoDaTela } from "./cabecalho-da-tela";
import { tela } from "./menu";

/** Tela que ainda não tem conteúdo: mostra o título e quando ela chega no Build Plan. */
export async function TelaEmBreve({ href }: { href: string }) {
  await exigirSessao();
  const t = tela(href);
  return (
    <>
      <CabecalhoDaTela titulo={t.nome} />
      <section className="border border-border px-5 py-10">
        <p className="m-0 text-text-muted">Chega na {t.etapa}.</p>
      </section>
    </>
  );
}

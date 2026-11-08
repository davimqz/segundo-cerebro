import type { ReactNode } from "react";
import { CabecalhoDaTela } from "@/components/cabecalho-da-tela";
import {
  camposDe,
  descricaoDe,
  NOME_DA_ORIGEM,
  nomeDaDecisao,
  solicitanteDe,
  tituloDe,
} from "@/core/aprovacoes/formatar";
import { anotarSaudeDoPaperclip, historico } from "@/core/aprovacoes/servico";
import { exigirSessao } from "@/core/auth/sessao";
import { aprovacoesConfiguradas } from "@/core/env";
import { listarAprovacoes, nomesDosAgentes } from "@/core/paperclip/cliente";
import { AtualizarSozinho, ListaDePendentes, type DecididoNaTela, type PedidoNaTela } from "./lista";

export const metadata = { title: "Aprovações" };
// Sempre lê o Paperclip na hora: a tela se atualiza a cada 10 segundos.
export const dynamic = "force-dynamic";

const formatoData = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const data = (iso: string | null) => (iso ? formatoData.format(new Date(iso)) : "—");

function Caixa({ children, papel }: { children: ReactNode; papel?: "alert" }) {
  return (
    <section role={papel} className="border border-border px-5 py-6">
      {children}
    </section>
  );
}

export default async function Aprovacoes() {
  await exigirSessao();
  const config = aprovacoesConfiguradas();

  if (!config) {
    return (
      <>
        <CabecalhoDaTela titulo="Aprovações" complemento="dos agentes" />
        <Caixa>
          <p className="m-0 text-text-muted">
            As aprovações não estão configuradas. Faltam PAPERCLIP_URL, PAPERCLIP_EMPRESA_ID ou PAPERCLIP_CHAVE_BOARD no
            .env do painel (veja o capítulo Aprovações do playbook).
          </p>
        </Caixa>
      </>
    );
  }

  const [pendentes, agentes, decididos] = await Promise.all([
    listarAprovacoes(config, "pending"),
    nomesDosAgentes(config),
    historico(config, 20),
  ]);
  const erro = !pendentes.ok ? pendentes.erro : !decididos.ok ? decididos.erro : null;
  await anotarSaudeDoPaperclip(erro);

  const listaPendentes: PedidoNaTela[] = pendentes.ok
    ? pendentes.aprovacoes.map((a) => ({
        id: a.id,
        titulo: tituloDe(a),
        tipo: a.type,
        descricao: descricaoDe(a),
        campos: camposDe(a),
        solicitante: solicitanteDe(a, agentes),
        criadoEm: data(a.createdAt),
      }))
    : [];
  const listaDecididos: DecididoNaTela[] = decididos.ok
    ? decididos.itens.map(({ aprovacao: a, origem }) => ({
        id: a.id,
        titulo: tituloDe(a),
        status: a.status,
        decisao: nomeDaDecisao(a.status),
        motivo: a.decisionNote,
        quando: data(a.decidedAt),
        // Sem atividade gravada pelo painel ou pelo bot, a decisão foi na tela do Paperclip.
        onde: NOME_DA_ORIGEM[origem ?? "paperclip"],
      }))
    : [];

  return (
    <>
      <CabecalhoDaTela titulo="Aprovações" complemento="dos agentes" />
      <AtualizarSozinho segundos={10} />

      {erro ? (
        <Caixa papel="alert">
          <p className="m-0 font-medium text-status-danger">Não consegui ler os pedidos do Paperclip.</p>
          <p className="m-0 mt-1 text-text-muted">{erro.mensagem}</p>
        </Caixa>
      ) : (
        <>
          <ListaDePendentes pedidos={listaPendentes} />

          <section aria-labelledby="titulo-historico" className="flex flex-col gap-3">
            <h2 id="titulo-historico" className="rotulo m-0 font-normal text-text-muted">
              Últimos decididos
            </h2>
            {listaDecididos.length === 0 ? (
              <div className="border border-border px-5 py-4 text-text-muted">Nenhum pedido decidido ainda.</div>
            ) : (
              <ul aria-label="Últimos decididos" className="m-0 flex list-none flex-col border border-border p-0">
                {listaDecididos.map((d) => (
                  <li
                    key={d.id}
                    id={`pedido-${d.id}`}
                    data-testid="decidido"
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border px-5 py-3 last:border-b-0"
                  >
                    <span className="flex items-center gap-1.5 text-[13px]">
                      <span
                        aria-hidden
                        className={`size-2 rounded-full ${d.status === "approved" ? "bg-status-success" : "bg-status-danger"}`}
                      />
                      {d.decisao}
                    </span>
                    <span className="min-w-0 flex-[1_1_240px] font-medium">{d.titulo}</span>
                    <span className="numeros-tabulares text-[13px] text-text-muted">
                      {d.quando} · no {d.onde}
                    </span>
                    {d.motivo && <p className="m-0 w-full text-[13px] text-text-muted">Motivo: {d.motivo}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}

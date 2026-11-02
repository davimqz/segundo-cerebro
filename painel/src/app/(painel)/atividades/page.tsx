import Link from "next/link";
import { z } from "zod";
import { CabecalhoDaTela } from "@/components/cabecalho-da-tela";
import { TagDepartamento } from "@/components/tag-departamento";
import { Button, variantesDoBotao } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { listar, opcoesDeFiltro } from "@/core/atividades/servico";
import { exigirSessao } from "@/core/auth/sessao";
import { listarDepartamentos } from "@/core/departamentos/servico";

export const metadata = { title: "Atividades" };

const esquemaFiltros = z.object({
  autor: z.string().max(200).optional().catch(undefined),
  acao: z.string().max(100).optional().catch(undefined),
  departamento: z.coerce.number().int().positive().optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).max(100000).optional().catch(undefined),
});

const formatoData = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" });

const AUTOR_TIPO = { usuario: "Usuário", agente: "Agente", sistema: "Sistema" } as const;

export default async function Atividades({ searchParams }: PageProps<"/atividades">) {
  await exigirSessao();
  const bruto = await searchParams;
  const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const f = esquemaFiltros.parse({
    autor: primeiro(bruto.autor),
    acao: primeiro(bruto.acao),
    departamento: primeiro(bruto.departamento),
    pagina: primeiro(bruto.pagina),
  });
  const pagina = f.pagina ?? 1;

  const [{ linhas, temMais }, opcoes, departamentos] = await Promise.all([
    listar({ autor: f.autor, acao: f.acao, departamentoId: f.departamento }, pagina),
    opcoesDeFiltro(),
    listarDepartamentos(),
  ]);

  const link = (p: number) => {
    const q = new URLSearchParams();
    if (f.autor) q.set("autor", f.autor);
    if (f.acao) q.set("acao", f.acao);
    if (f.departamento) q.set("departamento", String(f.departamento));
    q.set("pagina", String(p));
    return `/atividades?${q}`;
  };

  return (
    <>
      <CabecalhoDaTela titulo="Atividades" complemento="de agentes e pessoas" />

      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filtros">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-autor">Autor</Label>
          <Select id="f-autor" name="autor" defaultValue={f.autor ?? ""}>
            <option value="">Todos</option>
            {opcoes.autores.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-acao">Ação</Label>
          <Select id="f-acao" name="acao" defaultValue={f.acao ?? ""}>
            <option value="">Todas</option>
            {opcoes.acoes.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-departamento">Departamento</Label>
          <Select id="f-departamento" name="departamento" defaultValue={f.departamento ? String(f.departamento) : ""}>
            <option value="">Todos</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit">Filtrar</Button>
        <Link href="/atividades" className={variantesDoBotao({ variant: "fantasma" })}>
          Limpar
        </Link>
      </form>

      <section aria-label="Registros" className="border border-border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="rotulo text-left text-text-muted">
                {["Quando", "Autor", "Ação", "Alvo", "Departamento", "Aprovado por"].map((c) => (
                  <th key={c} scope="col" className="border-b border-border px-5 py-2.5 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-3 text-text-muted">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              )}
              {linhas.map((l) => (
                <tr key={l.id} className="even:bg-surface-subtle" data-testid="atividade">
                  <td className="numeros-tabulares border-b border-border px-5 py-3 whitespace-nowrap text-[13px]">
                    {formatoData.format(l.quando)}
                  </td>
                  <td className="border-b border-border px-5 py-3">
                    {l.autorNome ?? l.autorId}
                    <span className="block text-[13px] text-text-muted">{AUTOR_TIPO[l.autorTipo]}</span>
                  </td>
                  <td className="border-b border-border px-5 py-3 font-mono text-[13px]">{l.acao}</td>
                  <td className="border-b border-border px-5 py-3 text-[13px] text-text-muted">{l.alvo ?? "—"}</td>
                  <td className="border-b border-border px-5 py-3">
                    {l.departamento && l.departamentoSlug ? (
                      <TagDepartamento slug={l.departamentoSlug} nome={l.departamento} />
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="border-b border-border px-5 py-3 text-[13px]">{l.aprovadoPor ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <nav aria-label="Paginação" className="flex items-center justify-between px-5 py-3 text-[13px]">
          <span className="text-text-muted">Página {pagina}</span>
          <div className="flex gap-2">
            {pagina > 1 && (
              <Link href={link(pagina - 1)} className={variantesDoBotao({ size: "pequeno" })}>
                Anterior
              </Link>
            )}
            {temMais && (
              <Link href={link(pagina + 1)} className={variantesDoBotao({ size: "pequeno" })}>
                Próxima
              </Link>
            )}
          </div>
        </nav>
      </section>
    </>
  );
}

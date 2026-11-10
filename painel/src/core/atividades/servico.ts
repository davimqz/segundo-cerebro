import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { banco, type Banco } from "../db/client";
import { atividades, departamentos, type AutorTipo } from "../db/schema";

export const POR_PAGINA = 50;

export type NovaAtividade = {
  autorTipo: AutorTipo;
  autorId: string;
  acao: string;
  alvo?: string | null;
  departamentoId?: number | null;
  aprovadoPor?: string | null;
  detalhes?: Record<string, unknown>;
};

type Executor = Pick<Banco, "insert">;

/**
 * Grava uma ação na trilha de auditoria. A tabela só aceita inclusões.
 * Aceita uma transação (`tx`) para gravar junto com a mudança que ela registra.
 */
export async function registrar(a: NovaAtividade, tx: Executor = banco()): Promise<void> {
  await tx.insert(atividades).values({
    autorTipo: a.autorTipo,
    autorId: a.autorId,
    acao: a.acao,
    alvo: a.alvo ?? null,
    departamentoId: a.departamentoId ?? null,
    aprovadoPor: a.aprovadoPor ?? null,
    detalhes: a.detalhes ?? {},
  });
}

export type FiltrosAtividades = {
  autor?: string;
  acao?: string;
  departamentoId?: number;
};

export type LinhaAtividade = {
  id: number;
  quando: Date;
  autorTipo: AutorTipo;
  autorId: string;
  autorNome: string | null;
  acao: string;
  alvo: string | null;
  departamento: string | null;
  departamentoSlug: string | null;
  aprovadoPor: string | null;
};

/** Lista do mais novo para o mais antigo, 50 por página (a primeira página é 1). */
export async function listar(
  filtros: FiltrosAtividades,
  pagina: number,
): Promise<{ linhas: LinhaAtividade[]; temMais: boolean }> {
  const condicoes: SQL[] = [];
  if (filtros.autor) condicoes.push(eq(atividades.autorId, filtros.autor));
  if (filtros.acao) condicoes.push(eq(atividades.acao, filtros.acao));
  if (filtros.departamentoId) condicoes.push(eq(atividades.departamentoId, filtros.departamentoId));

  const p = Math.max(1, Math.floor(pagina) || 1);
  const linhas = await banco()
    .select({
      id: atividades.id,
      quando: atividades.quando,
      autorTipo: atividades.autorTipo,
      autorId: atividades.autorId,
      // O autor do tipo "usuario" guarda o id; o nome vem da tabela de usuários.
      autorNome: sql<
        string | null
      >`(select u.nome from usuarios u where u.id = ${atividades.autorId} and ${atividades.autorTipo} = 'usuario')`,
      acao: atividades.acao,
      alvo: atividades.alvo,
      departamento: departamentos.nome,
      departamentoSlug: departamentos.slug,
      aprovadoPor: atividades.aprovadoPor,
    })
    .from(atividades)
    .leftJoin(departamentos, eq(departamentos.id, atividades.departamentoId))
    .where(condicoes.length ? and(...condicoes) : undefined)
    .orderBy(desc(atividades.quando), desc(atividades.id))
    .limit(POR_PAGINA + 1)
    .offset((p - 1) * POR_PAGINA);

  return { linhas: linhas.slice(0, POR_PAGINA), temMais: linhas.length > POR_PAGINA };
}

export type AtividadeParaAgente = {
  quando: Date;
  autor: string;
  acao: string;
  alvo: string | null;
  departamento: string | null;
};

/**
 * As atividades mais novas, para os agentes (GET /api/v1/atividades). Sem `detalhes`, para não mandar
 * ao modelo motivos de recusa nem dados de clientes. O autor é o nome do usuário ou o id do agente.
 */
export async function ultimasAtividades(limite: number): Promise<AtividadeParaAgente[]> {
  return banco()
    .select({
      quando: atividades.quando,
      autor: sql<string>`coalesce((select u.nome from usuarios u where u.id = ${atividades.autorId} and ${atividades.autorTipo} = 'usuario'), ${atividades.autorId})`,
      acao: atividades.acao,
      alvo: atividades.alvo,
      departamento: departamentos.nome,
    })
    .from(atividades)
    .leftJoin(departamentos, eq(departamentos.id, atividades.departamentoId))
    .orderBy(desc(atividades.quando), desc(atividades.id))
    .limit(limite);
}

/** Valores distintos para os filtros da tela Atividades. */
export async function opcoesDeFiltro(): Promise<{
  autores: { id: string; nome: string }[];
  acoes: string[];
}> {
  const db = banco();
  const [autores, acoes] = await Promise.all([
    db.execute<{ id: string; nome: string }>(sql`
      select distinct a.autor_id as id, coalesce(u.nome, a.autor_id) as nome
      from atividades a
      left join usuarios u on u.id = a.autor_id and a.autor_tipo = 'usuario'
      order by nome`),
    db.execute<{ acao: string }>(sql`select distinct acao from atividades order by acao`),
  ]);
  return { autores: autores.rows, acoes: acoes.rows.map((r) => r.acao) };
}

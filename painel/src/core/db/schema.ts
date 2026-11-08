import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Núcleo do painel (docs/05-backend-schema.md) ──────────────────────────────

export const departamentos = pgTable("departamentos", {
  id: serial("id").primaryKey(),
  // Identificador estável, usado no nome do token de cor da tag (tag-<slug>).
  slug: text("slug").notNull().unique(),
  nome: text("nome").notNull(),
  ordem: integer("ordem").notNull(),
  areas: jsonb("areas").$type<string[]>().notNull().default([]),
});

export const temas = pgTable(
  "temas",
  {
    id: serial("id").primaryKey(),
    nome: text("nome").notNull(),
    // JSON no formato do tokens.json do Selecta (validado por src/core/temas/schema.ts).
    tokens: jsonb("tokens").notNull(),
    ativo: boolean("ativo").notNull().default(false),
    padrao: boolean("padrao").notNull().default(false),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Só um tema ativo e só um tema padrão por vez.
    uniqueIndex("temas_um_ativo")
      .on(t.ativo)
      .where(sql`${t.ativo}`),
    uniqueIndex("temas_um_padrao")
      .on(t.padrao)
      .where(sql`${t.padrao}`),
  ],
);

export const AUTOR_TIPOS = ["usuario", "agente", "sistema"] as const;
export type AutorTipo = (typeof AUTOR_TIPOS)[number];

// Append-only: um gatilho no banco recusa UPDATE e DELETE (migração 0001).
export const atividades = pgTable(
  "atividades",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    quando: timestamp("quando", { withTimezone: true }).notNull().defaultNow(),
    autorTipo: text("autor_tipo").$type<AutorTipo>().notNull(),
    autorId: text("autor_id").notNull(),
    departamentoId: integer("departamento_id").references(() => departamentos.id),
    acao: text("acao").notNull(),
    alvo: text("alvo"),
    aprovadoPor: text("aprovado_por"),
    detalhes: jsonb("detalhes").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    check("atividades_autor_tipo", sql`${t.autorTipo} in ('usuario', 'agente', 'sistema')`),
    index("atividades_quando").on(t.quando.desc(), t.id.desc()),
    index("atividades_acao").on(t.acao),
    index("atividades_autor").on(t.autorTipo, t.autorId),
    index("atividades_departamento").on(t.departamentoId),
  ],
);

export const AVISO_TIPOS = ["alerta", "erro"] as const;
export type AvisoTipo = (typeof AVISO_TIPOS)[number];

export const avisos = pgTable(
  "avisos",
  {
    id: serial("id").primaryKey(),
    tipo: text("tipo").$type<AvisoTipo>().notNull(),
    mensagem: text("mensagem").notNull(),
    origem: text("origem").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    resolvidoEm: timestamp("resolvido_em", { withTimezone: true }),
    resolvidoPor: text("resolvido_por"),
  },
  (t) => [
    check("avisos_tipo", sql`${t.tipo} in ('alerta', 'erro')`),
    index("avisos_abertos")
      .on(t.criadoEm)
      .where(sql`${t.resolvidoEm} is null`),
  ],
);

export const integracoes = pgTable("integracoes", {
  id: serial("id").primaryKey(),
  servico: text("servico").notNull().unique(),
  status: text("status").notNull().default("desconectado"),
  ultimaVerificacao: timestamp("ultima_verificacao", { withTimezone: true }),
});

export const configuracoes = pgTable("configuracoes", {
  chave: text("chave").primaryKey(),
  valor: jsonb("valor").notNull(),
});

// ─── Aprovações (spec 006) ──────────────────────────────────────────────────────
// Os pedidos vivem no Paperclip. Aqui fica só o estado do bot de aprovações do Telegram: a mensagem
// mandada para cada pedido (uma vez só) e a pergunta de motivo aberta, se houver.

export const aprovacoesTelegram = pgTable("aprovacoes_telegram", {
  aprovacaoId: text("aprovacao_id").primaryKey(),
  // Vazio só se o envio caiu no meio; o pedido não é mandado de novo.
  mensagemId: bigint("mensagem_id", { mode: "number" }),
  perguntaMotivoId: bigint("pergunta_motivo_id", { mode: "number" }),
  // Último status do pedido que o bot já mostrou na mensagem (pending, approved, rejected...).
  statusVisto: text("status_visto").notNull().default("pending"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Login (Better Auth, ADR 0004) ──────────────────────────────────────────────
// Os nomes das propriedades seguem os campos do Better Auth; as tabelas e colunas, o padrão do banco.

export const usuarios = pgTable("usuarios", {
  id: text("id").primaryKey(),
  name: text("nome").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verificado").notNull().default(false),
  image: text("imagem"),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const sessoes = pgTable(
  "sessoes",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expira_em", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip"),
    userAgent: text("user_agent"),
    userId: text("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
  },
  (t) => [index("sessoes_usuario").on(t.userId)],
);

export const contas = pgTable(
  "contas",
  {
    id: text("id").primaryKey(),
    accountId: text("conta_id").notNull(),
    providerId: text("provedor_id").notNull(),
    userId: text("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expira_em", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expira_em", { withTimezone: true }),
    scope: text("escopo"),
    password: text("senha_hash"),
    createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("contas_usuario").on(t.userId)],
);

export const verificacoes = pgTable("verificacoes", {
  id: text("id").primaryKey(),
  identifier: text("identificador").notNull(),
  value: text("valor").notNull(),
  expiresAt: timestamp("expira_em", { withTimezone: true }).notNull(),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

// Contador do limite de tentativas do Better Auth (rateLimit.storage = "database").
export const limitesTentativas = pgTable("limites_tentativas", {
  id: text("id").primaryKey(),
  key: text("chave").notNull().unique(),
  count: integer("contagem").notNull(),
  lastRequest: bigint("ultimo_pedido", { mode: "number" }).notNull(),
});

/** Mapa usado pelo adaptador do Better Auth (nome do modelo → tabela). */
export const tabelasDoLogin = {
  user: usuarios,
  session: sessoes,
  account: contas,
  verification: verificacoes,
  rateLimit: limitesTentativas,
};

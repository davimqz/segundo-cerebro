CREATE TABLE "atividades" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"quando" timestamp with time zone DEFAULT now() NOT NULL,
	"autor_tipo" text NOT NULL,
	"autor_id" text NOT NULL,
	"departamento_id" integer,
	"acao" text NOT NULL,
	"alvo" text,
	"aprovado_por" text,
	"detalhes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "atividades_autor_tipo" CHECK ("atividades"."autor_tipo" in ('usuario', 'agente', 'sistema'))
);
--> statement-breakpoint
CREATE TABLE "avisos" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"mensagem" text NOT NULL,
	"origem" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"resolvido_em" timestamp with time zone,
	"resolvido_por" text,
	CONSTRAINT "avisos_tipo" CHECK ("avisos"."tipo" in ('alerta', 'erro'))
);
--> statement-breakpoint
CREATE TABLE "configuracoes" (
	"chave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contas" (
	"id" text PRIMARY KEY NOT NULL,
	"conta_id" text NOT NULL,
	"provedor_id" text NOT NULL,
	"usuario_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expira_em" timestamp with time zone,
	"refresh_token_expira_em" timestamp with time zone,
	"escopo" text,
	"senha_hash" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departamentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer NOT NULL,
	"areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "departamentos_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "integracoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"servico" text NOT NULL,
	"status" text DEFAULT 'desconectado' NOT NULL,
	"ultima_verificacao" timestamp with time zone,
	CONSTRAINT "integracoes_servico_unique" UNIQUE("servico")
);
--> statement-breakpoint
CREATE TABLE "limites_tentativas" (
	"id" text PRIMARY KEY NOT NULL,
	"chave" text NOT NULL,
	"contagem" integer NOT NULL,
	"ultimo_pedido" bigint NOT NULL,
	CONSTRAINT "limites_tentativas_chave_unique" UNIQUE("chave")
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"id" text PRIMARY KEY NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text,
	"usuario_id" text NOT NULL,
	CONSTRAINT "sessoes_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "temas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"tokens" jsonb NOT NULL,
	"ativo" boolean DEFAULT false NOT NULL,
	"padrao" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"email_verificado" boolean DEFAULT false NOT NULL,
	"imagem" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificacoes" (
	"id" text PRIMARY KEY NOT NULL,
	"identificador" text NOT NULL,
	"valor" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_departamento_id_departamentos_id_fk" FOREIGN KEY ("departamento_id") REFERENCES "public"."departamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas" ADD CONSTRAINT "contas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atividades_quando" ON "atividades" USING btree ("quando" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "atividades_acao" ON "atividades" USING btree ("acao");--> statement-breakpoint
CREATE INDEX "atividades_autor" ON "atividades" USING btree ("autor_tipo","autor_id");--> statement-breakpoint
CREATE INDEX "atividades_departamento" ON "atividades" USING btree ("departamento_id");--> statement-breakpoint
CREATE INDEX "avisos_abertos" ON "avisos" USING btree ("criado_em") WHERE "avisos"."resolvido_em" is null;--> statement-breakpoint
CREATE INDEX "contas_usuario" ON "contas" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "sessoes_usuario" ON "sessoes" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "temas_um_ativo" ON "temas" USING btree ("ativo") WHERE "temas"."ativo";--> statement-breakpoint
CREATE UNIQUE INDEX "temas_um_padrao" ON "temas" USING btree ("padrao") WHERE "temas"."padrao";
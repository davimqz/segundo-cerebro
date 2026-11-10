CREATE TABLE "chaves_agentes" (
	"id" serial PRIMARY KEY NOT NULL,
	"agente" text NOT NULL,
	"hash" text NOT NULL,
	"escopos" text[] NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"revogada_em" timestamp with time zone,
	CONSTRAINT "chaves_agentes_hash_unique" UNIQUE("hash"),
	CONSTRAINT "chaves_agentes_escopos" CHECK ("chaves_agentes"."escopos" <@ array['departamentos:ler', 'atividades:ler', 'avisos:ler', 'tarefas:registrar']::text[])
);
--> statement-breakpoint
CREATE INDEX "chaves_agentes_agente" ON "chaves_agentes" USING btree ("agente");
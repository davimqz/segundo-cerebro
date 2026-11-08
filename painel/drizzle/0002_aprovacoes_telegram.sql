CREATE TABLE "aprovacoes_telegram" (
	"aprovacao_id" text PRIMARY KEY NOT NULL,
	"mensagem_id" bigint,
	"pergunta_motivo_id" bigint,
	"status_visto" text DEFAULT 'pending' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);

-- A tabela atividades é a trilha de auditoria: só recebe inclusões.
-- O gatilho recusa UPDATE, DELETE e TRUNCATE, venha o comando de onde vier.
CREATE FUNCTION atividades_somente_inclusao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'atividades é append-only: % não é permitido', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER atividades_sem_update_delete
  BEFORE UPDATE OR DELETE ON atividades
  FOR EACH ROW EXECUTE FUNCTION atividades_somente_inclusao();
--> statement-breakpoint
CREATE TRIGGER atividades_sem_truncate
  BEFORE TRUNCATE ON atividades
  FOR EACH STATEMENT EXECUTE FUNCTION atividades_somente_inclusao();

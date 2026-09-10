-- Remove o gatilho órfão que impedia criar QUALQUER demanda.
--
-- `20250104160000_add_assignee_team_validation` criou o gatilho `check_task_assignee_team` e a
-- função `validate_task_assignee_team()`, que leem `NEW."assigneeId"` e `NEW."currentStageId"`.
-- `20260901180000_drop_task_assignee` derrubou a coluna `assigneeId` (e `currentStageId` já não
-- existia) — mas não derrubou o gatilho. Um gatilho BEFORE INSERT que lê um campo inexistente do
-- registro faz o Postgres recusar a linha com `column "new" does not exist`, que é uma mensagem
-- que não aponta para lugar nenhum.
--
-- Ou seja: desde 1º de setembro, `tx.task.create` falha SEMPRE. A suíte não pegou porque os testes
-- de criação de demanda usam cliente falso, e ninguém criou demanda de verdade no intervalo. Isto
-- apareceu na primeira gravação da importação do Trello, que quebrou nos 17 meses de uma vez.
--
-- A validação que o gatilho fazia não faz falta: o responsável neste sistema é por ETAPA, e
-- `createTaskStages` (lib/stage-assignment-helpers.ts) já recusa atribuir alguém que não pertence
-- ao time efetivo da etapa. A regra continua existindo — no lugar certo.

DROP TRIGGER IF EXISTS check_task_assignee_team ON "Task";
DROP FUNCTION IF EXISTS validate_task_assignee_team();

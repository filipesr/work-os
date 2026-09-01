-- Remove o responsável no nível da DEMANDA.
--
-- `Task.assigneeId` existia desde o começo e NENHUM caminho do fluxo o escrevia: a atribuição
-- neste sistema é por ETAPA (`TaskActiveStage.assigneeId`), porque é a etapa que tem dono, prazo e
-- equipe. Três telas leram a coluna achando que era a fonte — os filtros do quadro do projeto, a
-- cobertura semanal e um cartão do perfil da pessoa — e as três mostraram informação que nunca
-- esteve certa ("sem responsável" para toda demanda, filtro que devolvia sempre vazio, contador
-- travado em zero). Enquanto a coluna ficasse, era uma armadilha com nome de API.
--
-- Conferido antes de remover: zero linhas com o campo preenchido. Nada se perde.

ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_assigneeId_fkey";
DROP INDEX IF EXISTS "Task_assigneeId_idx";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "assigneeId";

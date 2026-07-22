-- prisma/migrations/20260722160000_add_task_workflow_template/migration.sql
-- Denormaliza o tipo de trabalho (template) no Task, para reference-class forecasting.

ALTER TABLE "Task" ADD COLUMN "workflowTemplateId" TEXT;

ALTER TABLE "Task" ADD CONSTRAINT "Task_workflowTemplateId_fkey"
  FOREIGN KEY ("workflowTemplateId") REFERENCES "WorkflowTemplate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Task_workflowTemplateId_completedAt_idx"
  ON "Task"("workflowTemplateId", "completedAt");

-- Backfill: cada tarefa herda o templateId de qualquer uma de suas etapas
-- (todas as etapas de uma tarefa pertencem a um único template).
UPDATE "Task" SET "workflowTemplateId" = sub."templateId"
FROM (
  SELECT DISTINCT ON (tas."taskId") tas."taskId", ts."templateId"
  FROM "TaskActiveStage" tas
  JOIN "TemplateStage" ts ON ts.id = tas."stageId"
) sub
WHERE "Task".id = sub."taskId";

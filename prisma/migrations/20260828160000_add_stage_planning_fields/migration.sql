-- Programação semanal: dia + ordem, e a janela fixa dos itens agendados.
--
-- Tudo anulável e sem backfill: demanda existente simplesmente não está programada, que é a
-- verdade. Preencher retroativamente inventaria um plano que ninguém fez.
--
-- O índice serve à consulta que a tela faz o tempo todo: "o que a pessoa X tem no dia Y".
ALTER TABLE "TaskActiveStage" ADD COLUMN "plannedDate" TIMESTAMP(3);
ALTER TABLE "TaskActiveStage" ADD COLUMN "plannedOrder" INTEGER;
ALTER TABLE "TaskActiveStage" ADD COLUMN "scheduledStart" TIMESTAMP(3);
ALTER TABLE "TaskActiveStage" ADD COLUMN "scheduledEnd" TIMESTAMP(3);

CREATE INDEX "TaskActiveStage_assigneeId_plannedDate_idx"
  ON "TaskActiveStage"("assigneeId", "plannedDate");

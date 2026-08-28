-- Programação semanal: dia + ordem, e a janela fixa dos itens agendados.
--
-- Tudo anulável e sem backfill: demanda existente simplesmente não está programada, que é a
-- verdade. Preencher retroativamente inventaria um plano que ninguém fez.
--
-- O índice tem `plannedDate` na FRENTE porque a consulta da mesa semanal filtra a faixa de dias
-- SEM `assigneeId` — a grade monta a semana de todo mundo de uma vez —, e um índice composto não é
-- usado quando a primeira coluna fica de fora do filtro. Nesta ordem ele também continua servindo
-- aos acessos por pessoa+dia (programar e reordenar), que dão as duas colunas juntas.
ALTER TABLE "TaskActiveStage" ADD COLUMN "plannedDate" TIMESTAMP(3);
ALTER TABLE "TaskActiveStage" ADD COLUMN "plannedOrder" INTEGER;
ALTER TABLE "TaskActiveStage" ADD COLUMN "scheduledStart" TIMESTAMP(3);
ALTER TABLE "TaskActiveStage" ADD COLUMN "scheduledEnd" TIMESTAMP(3);

CREATE INDEX "TaskActiveStage_plannedDate_assigneeId_idx"
  ON "TaskActiveStage"("plannedDate", "assigneeId");

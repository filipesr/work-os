-- Início PLANEJADO da demanda (prazo − duração somada das etapas, editável).
-- Distinto de `startedAt`, que é o início REAL. Sem backfill: demandas anteriores
-- não têm plano de início, e inventar um a partir do `createdAt` fabricaria um
-- compromisso que ninguém assumiu.
ALTER TABLE "Task" ADD COLUMN "plannedStartAt" TIMESTAMP(3);

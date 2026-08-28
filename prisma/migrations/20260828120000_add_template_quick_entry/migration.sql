-- Marca de fluxo de ENTRADA RÁPIDA (tarefa de etapa única, registrada depois de acontecer).
--
-- Default false, sem backfill: todos os templates existentes são fluxos normais, e marcar algum
-- retroativamente mudaria a classe de demandas já entregues — reescrevendo métrica fechada.
ALTER TABLE "WorkflowTemplate" ADD COLUMN "quickEntry" BOOLEAN NOT NULL DEFAULT false;

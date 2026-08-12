-- Separa lead time de cycle time: até aqui as duas métricas usavam a MESMA
-- fórmula (completedAt − createdAt), porque não existia registro de quando a
-- tarefa efetivamente começou. O sinal existia no fluxo (Task.status → IN_PROGRESS)
-- mas não era persistido, e não há log de transição de Task.status.
--
--   lead time  = completedAt − createdAt   (demanda → entrega)
--   cycle time = completedAt − startedAt   (início  → entrega)
--   queue time = startedAt   − createdAt   (espera na fila)

-- Coluna anulável; novas linhas nascem NULL e são carimbadas no código, uma única
-- vez, na primeira promoção para IN_PROGRESS (lib/task-start.ts).
ALTER TABLE "Task" ADD COLUMN "startedAt" TIMESTAMP(3);

-- SEM BACKFILL — decisão deliberada. O único proxy disponível seria
-- min(TaskActiveStage.assignedAt), que é sobrescrito a cada reatribuição e
-- portanto só daria um limite inferior; e usar createdAt fabricaria "fila zero",
-- que é exatamente o erro sendo corrigido. Tarefas anteriores a esta migração
-- ficam com startedAt NULL e saem da base de cycle time, mesma postura já
-- adotada para o CFD e a eficiência de fluxo (20260721130000).

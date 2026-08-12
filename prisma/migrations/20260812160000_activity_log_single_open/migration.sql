-- Exclusividade de trabalho em execução: UMA tarefa contando tempo por pessoa.
--
-- Antes isso era só uma convenção do código (`startWorkOnTask` fechava o log
-- anterior antes de abrir o novo). Convenção não sobrevive a concorrência: dois
-- cliques simultâneos — duas abas, duplo clique, retry de rede — podem ambos ler
-- "não há log aberto" e ambos criar um. O resultado seriam dois cronômetros
-- correndo para a mesma pessoa, e o quadro de presença mostrando duas tarefas.
--
-- Índice PARCIAL: a restrição vale só para logs abertos (endedAt IS NULL). Os
-- fechados são histórico e podem repetir o mesmo userId à vontade — sem o
-- WHERE, cada pessoa só poderia ter um registro de trabalho na vida.
CREATE UNIQUE INDEX "ActivityLog_userId_open_key"
  ON "ActivityLog"("userId")
  WHERE "endedAt" IS NULL;

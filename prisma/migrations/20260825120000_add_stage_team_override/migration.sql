-- Etapa coringa: uma etapa de template sem `defaultTeamId` é flexível por
-- desenho — o template afirma que o passo existe, não quem o executa. O
-- roteamento passa a ser decidido na CRIAÇÃO da demanda e vive aqui.
--
-- Sem backfill: `teamId` nulo significa "herda o time padrão da etapa", que é o
-- comportamento de todas as linhas existentes. Preencher retroativamente
-- inventaria uma decisão de roteamento que ninguém tomou.
ALTER TABLE "TaskActiveStage" ADD COLUMN "teamId" TEXT;
ALTER TABLE "TaskActiveStage" ADD COLUMN "instructions" TEXT;

-- SET NULL no delete: apagar um time não pode apagar a etapa nem a demanda. A
-- etapa volta a herdar o time padrão do template (provavelmente nenhum), e
-- reaparece como não-roteada em vez de sumir da fila silenciosamente.
ALTER TABLE "TaskActiveStage"
  ADD CONSTRAINT "TaskActiveStage_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE INDEX "TaskActiveStage_teamId_idx" ON "TaskActiveStage"("teamId");

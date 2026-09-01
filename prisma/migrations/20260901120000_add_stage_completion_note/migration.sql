-- Justificativa de conclusão de etapa fora da referência.
--
-- Tabela nova e nada tocado no que já existe: nenhuma coluna alterada, nenhum backfill. Demanda
-- concluída antes desta regra simplesmente não tem nota, que é a verdade sobre ela.
CREATE TYPE "StageNoteReason" AS ENUM ('EXTERNAL_INTERRUPTION', 'REWORK', 'SCOPE_LARGER', 'TIMER_FORGOTTEN', 'OTHER');

CREATE TABLE "StageCompletionNote" (
    "id" TEXT NOT NULL,
    "reason" "StageNoteReason" NOT NULL,
    "note" TEXT,
    "hoursLogged" DOUBLE PRECISION NOT NULL,
    "referenceHours" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "StageCompletionNote_pkey" PRIMARY KEY ("id")
);

-- A leitura que interessa é por ETAPA ao longo do tempo ("metade das estouradas da Edição foi
-- interrupção externa"). Nunca por pessoa — ver a spec.
CREATE INDEX "StageCompletionNote_stageId_createdAt_idx" ON "StageCompletionNote"("stageId", "createdAt");
CREATE INDEX "StageCompletionNote_taskId_idx" ON "StageCompletionNote"("taskId");

ALTER TABLE "StageCompletionNote" ADD CONSTRAINT "StageCompletionNote_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StageCompletionNote" ADD CONSTRAINT "StageCompletionNote_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "TemplateStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StageCompletionNote" ADD CONSTRAINT "StageCompletionNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

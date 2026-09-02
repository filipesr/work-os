-- A etapa entra no comentário, e a demanda passa a saber quem a criou.
--
-- Três colunas anuláveis e nenhum backfill: comentário antigo fica sem etapa e demanda antiga sem
-- criador. Inventar esses vínculos pelo autor é exatamente o defeito que esta entrega remove do
-- WorkflowHistoryModal — gravá-lo promoveria o chute a dado.
--
-- `activeStageId` aponta para a INSTÂNCIA (TaskActiveStage), não para a etapa do template: quando a
-- demanda puder ter duas "Gravação" (spec das instâncias), o template não diria de qual delas é o
-- comentário. SET NULL porque a janela de correção apaga linhas de etapa opcional, e um comentário
-- não pode sumir junto com o recorte do fluxo.
CREATE TYPE "CommentKind" AS ENUM ('USER', 'STAGE_INSTRUCTION');

ALTER TABLE "TaskComment" ADD COLUMN "kind" "CommentKind" NOT NULL DEFAULT 'USER';
ALTER TABLE "TaskComment" ADD COLUMN "activeStageId" TEXT;
ALTER TABLE "Task" ADD COLUMN "createdById" TEXT;

ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_activeStageId_fkey"
  FOREIGN KEY ("activeStageId") REFERENCES "TaskActiveStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A leitura que interessa é "os comentários desta etapa", montada a cada abertura da tela da etapa.
CREATE INDEX "TaskComment_activeStageId_idx" ON "TaskComment"("activeStageId");

-- prisma/migrations/20260722170000_add_rework_event/migration.sql
-- ReworkEvent: registra cada reversão (retrabalho) atribuída à etapa-origem,
-- interno vs cliente. Aditivo; sem backfill (reversões antigas não têm kind/origem).

CREATE TYPE "ReworkKind" AS ENUM ('INTERNAL', 'CLIENT');

CREATE TABLE "ReworkEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "ReworkKind" NOT NULL,
    "reason" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "sourceStageId" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,

    CONSTRAINT "ReworkEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReworkEvent_sourceStageId_at_idx" ON "ReworkEvent"("sourceStageId", "at");
CREATE INDEX "ReworkEvent_taskId_idx" ON "ReworkEvent"("taskId");

ALTER TABLE "ReworkEvent" ADD CONSTRAINT "ReworkEvent_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReworkEvent" ADD CONSTRAINT "ReworkEvent_sourceStageId_fkey"
    FOREIGN KEY ("sourceStageId") REFERENCES "TemplateStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReworkEvent" ADD CONSTRAINT "ReworkEvent_byUserId_fkey"
    FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

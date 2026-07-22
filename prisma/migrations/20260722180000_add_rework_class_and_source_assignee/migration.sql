-- prisma/migrations/20260722180000_add_rework_class_and_source_assignee/migration.sql
-- 3b: classificação (defeito/legítimo) + quem fez a etapa-origem (para FTR por pessoa).
-- Aditivo; sem backfill (eventos antigos ficam não-classificados e sem sourceAssignee).

CREATE TYPE "ReworkClass" AS ENUM ('DEFECT', 'LEGITIMATE');

ALTER TABLE "ReworkEvent" ADD COLUMN "reworkClass" "ReworkClass";
ALTER TABLE "ReworkEvent" ADD COLUMN "sourceAssigneeId" TEXT;

CREATE INDEX "ReworkEvent_sourceAssigneeId_at_idx" ON "ReworkEvent"("sourceAssigneeId", "at");

ALTER TABLE "ReworkEvent" ADD CONSTRAINT "ReworkEvent_sourceAssigneeId_fkey"
    FOREIGN KEY ("sourceAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- StageTransition: append-only log of every ActiveStageStatus change per (task, stage).
-- Enables exact flow-efficiency (ACTIVE "touched" vs BLOCKED "waiting"), which the single
-- overwritable timestamps on TaskActiveStage cannot retain across block/unblock/revert cycles.

CREATE TABLE "StageTransition" (
    "id" TEXT NOT NULL,
    "status" "ActiveStageStatus" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,

    CONSTRAINT "StageTransition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StageTransition_taskId_stageId_at_idx" ON "StageTransition"("taskId", "stageId", "at");
CREATE INDEX "StageTransition_stageId_idx" ON "StageTransition"("stageId");

ALTER TABLE "StageTransition" ADD CONSTRAINT "StageTransition_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StageTransition" ADD CONSTRAINT "StageTransition_stageId_fkey"
    FOREIGN KEY ("stageId") REFERENCES "TemplateStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: seed ONE anchor row per existing TaskActiveStage carrying its CURRENT status at
-- its best-known entry time. This lets the NEXT real transition pair correctly (compute a
-- duration from the true entry time). Historical COMPLETED stages contribute no ACTIVE/BLOCKED
-- split — honest: their waiting time was never recorded and is not fabricated here.
INSERT INTO "StageTransition" ("id", "status", "at", "taskId", "stageId")
SELECT
    gen_random_uuid()::text,
    "status",
    CASE
        WHEN "status" = 'COMPLETED' THEN COALESCE("completedAt", "activatedAt")
        WHEN "status" = 'BLOCKED'   THEN COALESCE("blockedAt", "activatedAt")
        ELSE "activatedAt"
    END,
    "taskId",
    "stageId"
FROM "TaskActiveStage";

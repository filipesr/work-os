-- CreateEnum
CREATE TYPE "StageLogStatus" AS ENUM ('COMPLETED', 'REVERTED');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "completedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TaskStageLog" ADD COLUMN "status" "StageLogStatus";

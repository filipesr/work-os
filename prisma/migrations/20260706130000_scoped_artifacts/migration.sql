-- Scoped artifacts (spec 2026-07-06): artifacts gain a `scope` and optional project/client owners.
-- taskId becomes nullable so PROJECT/CLIENT-scoped artifacts have no task. Existing rows stay TASK.

-- CreateEnum
CREATE TYPE "ArtifactScope" AS ENUM ('TASK', 'PROJECT', 'CLIENT');

-- AlterTable
ALTER TABLE "TaskArtifact" ADD COLUMN     "scope" "ArtifactScope" NOT NULL DEFAULT 'TASK',
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "clientId" TEXT,
ALTER COLUMN "taskId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "TaskArtifact_projectId_idx" ON "TaskArtifact"("projectId");

-- CreateIndex
CREATE INDEX "TaskArtifact_clientId_idx" ON "TaskArtifact"("clientId");

-- AddForeignKey
ALTER TABLE "TaskArtifact" ADD CONSTRAINT "TaskArtifact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TaskArtifact" ADD CONSTRAINT "TaskArtifact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

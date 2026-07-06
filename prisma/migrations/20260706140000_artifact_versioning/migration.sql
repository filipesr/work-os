-- Artifact versioning (spec 2026-07-06): version chain via rootId + isCurrent.
-- Reuses the existing `version` column (was nullable, NAS-only) as the chain version.

-- Backfill existing NULL versions to 1, then make version NOT NULL with default 1.
UPDATE "TaskArtifact" SET "version" = 1 WHERE "version" IS NULL;
ALTER TABLE "TaskArtifact" ALTER COLUMN "version" SET DEFAULT 1;
ALTER TABLE "TaskArtifact" ALTER COLUMN "version" SET NOT NULL;

-- New chain columns. Existing rows become v1, current, self-rooted (rootId NULL).
ALTER TABLE "TaskArtifact" ADD COLUMN "rootId" TEXT;
ALTER TABLE "TaskArtifact" ADD COLUMN "isCurrent" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "TaskArtifact_rootId_idx" ON "TaskArtifact"("rootId");

-- P2: WIP limit per template stage + weekly capacity target per user.
-- Both nullable/additive (null = unset) — safe, no backfill needed.

ALTER TABLE "TemplateStage" ADD COLUMN "wipLimit" INTEGER;
ALTER TABLE "User" ADD COLUMN "weeklyCapacityHours" INTEGER;

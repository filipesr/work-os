-- Add optional SLA target (expected time-in-stage, in hours) to TemplateStage.
-- Nullable and additive: existing rows default to NULL (no SLA defined).
ALTER TABLE "TemplateStage" ADD COLUMN "expectedDurationHours" INTEGER;

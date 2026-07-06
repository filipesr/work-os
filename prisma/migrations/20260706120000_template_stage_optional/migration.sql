-- Add per-task "optional" flag to TemplateStage.
-- Additive and non-nullable with a default: existing rows become optional=false
-- (i.e. always included), preserving current behaviour.
ALTER TABLE "TemplateStage" ADD COLUMN "optional" BOOLEAN NOT NULL DEFAULT false;

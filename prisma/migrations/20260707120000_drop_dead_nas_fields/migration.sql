-- Limpeza pós-Frente B: campos NAS mortos.
-- TaskArtifact.target (ArtifactTarget) e TemplateStage.defaultMediaType não têm mais uso
-- (o caminho institucional por escopo não usa target; a UI de mídia-padrão foi removida).
ALTER TABLE "TaskArtifact" DROP COLUMN IF EXISTS "target";
ALTER TABLE "TemplateStage" DROP COLUMN IF EXISTS "defaultMediaType";
DROP TYPE IF EXISTS "ArtifactTarget";

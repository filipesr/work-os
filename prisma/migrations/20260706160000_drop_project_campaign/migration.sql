-- Frente B: remove campaign metadata + nasUploadEnabled gate from Project (spec 2026-07-06).
-- O caminho NAS agora deriva de dados existentes (cliente/projeto/tarefa) — ver lib/nas/path.ts.
ALTER TABLE "Project" DROP COLUMN IF EXISTS "campaignSlug";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "campaignYear";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "campaignMonth";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "nasUploadEnabled";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "nasMetadataReviewedAt";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "nasMetadataReviewedById";

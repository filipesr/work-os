-- Versionamento por NOME DO ARQUIVO: identidade da cadeia passa a ser `fileKey` (token normalizado
-- do nome do arquivo enviado) em vez de (purposeId, mediaType). Propósito foi removido do fluxo.

-- 1) Nova coluna.
ALTER TABLE "TaskArtifact" ADD COLUMN "fileKey" TEXT;

-- 2) Troca a constraint única da cadeia de versões.
DROP INDEX IF EXISTS "TaskArtifact_taskId_purposeId_mediaType_version_key";
CREATE UNIQUE INDEX "TaskArtifact_taskId_fileKey_version_key" ON "TaskArtifact"("taskId", "fileKey", "version");

-- 3) Índice de apoio ao agrupamento por arquivo (escopos projeto/cliente).
CREATE INDEX "TaskArtifact_fileKey_idx" ON "TaskArtifact"("fileKey");

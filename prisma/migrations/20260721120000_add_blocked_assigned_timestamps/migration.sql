-- Fase 2 do cockpit admin: timestamps precisos em TaskActiveStage
-- (antes a duração de bloqueio e a data de atribuição eram proxied por activatedAt).

-- 1) Novas colunas anuláveis (novas linhas nascem NULL; carimbadas no código nas transições).
ALTER TABLE "TaskActiveStage" ADD COLUMN "blockedAt" TIMESTAMP(3);
ALTER TABLE "TaskActiveStage" ADD COLUMN "assignedAt" TIMESTAMP(3);

-- 2) Backfill best-effort a partir de activatedAt para as linhas existentes:
--    - assignedAt para linhas que já têm um responsável;
--    - blockedAt para linhas atualmente bloqueadas.
UPDATE "TaskActiveStage" SET "assignedAt" = "activatedAt" WHERE "assigneeId" IS NOT NULL;
UPDATE "TaskActiveStage" SET "blockedAt" = "activatedAt" WHERE "status" = 'BLOCKED';

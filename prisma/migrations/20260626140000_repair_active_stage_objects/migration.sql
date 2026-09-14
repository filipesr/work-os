-- REPARO: objetos que existem no banco mas nunca nasceram de uma migração.
--
-- `TaskActiveStage` e o tipo `ActiveStageStatus` chegaram ao banco por `prisma db push`, que aplica
-- o schema direto e NÃO grava arquivo de migração. O histórico ficou com um buraco: seis migrações
-- posteriores alteram essa tabela, e duas alteram esse tipo, sem que nada os tivesse criado.
--
-- Quem rodasse `prisma migrate dev` — o comando padrão para criar a PRÓXIMA migração — batia em
-- `P3006 / 42704: type "ActiveStageStatus" does not exist` ao replicar a história no shadow
-- database, e a mensagem apontava para a migração de 26/jun, que é inocente: ela só é a primeira
-- a tocar no que nunca foi criado. Só `migrate deploy` funcionava, porque ele aplica os arquivos
-- pendentes direto, sem replicar nada.
--
-- Esta migração é datada ANTES da primeira que referencia os objetos, para que o replay do shadow
-- database os encontre. E é IDEMPOTENTE de propósito: nos bancos que já existem (produção
-- inclusive) tudo isto já está lá, e a migração precisa passar sem fazer nada.

-- O enum nasce com TRÊS valores, não quatro: `20260626150000_add_inactive_stage_status` é quem
-- acrescenta `INACTIVE`, logo em seguida. Criá-lo aqui já completo faria aquele `ALTER TYPE ... ADD
-- VALUE` falhar por duplicidade — o reparo tem que devolver a história como ela foi, não como ela
-- terminou.
DO $$ BEGIN
  CREATE TYPE "ActiveStageStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- A tabela no estado em que as migrações seguintes a encontram: sem `blockedAt`/`assignedAt`
-- (20260721120000), sem `teamId`/`instructions` (20260825120000) e sem os quatro campos de
-- programação (20260828160000). Cada uma delas continua sendo quem acrescenta o seu.
CREATE TABLE IF NOT EXISTS "TaskActiveStage" (
    "id" TEXT NOT NULL,
    "status" "ActiveStageStatus" NOT NULL DEFAULT 'ACTIVE',
    "taskId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TaskActiveStage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TaskActiveStage_taskId_stageId_key"
  ON "TaskActiveStage"("taskId", "stageId");
CREATE INDEX IF NOT EXISTS "TaskActiveStage_taskId_idx"     ON "TaskActiveStage"("taskId");
CREATE INDEX IF NOT EXISTS "TaskActiveStage_stageId_idx"    ON "TaskActiveStage"("stageId");
CREATE INDEX IF NOT EXISTS "TaskActiveStage_assigneeId_idx" ON "TaskActiveStage"("assigneeId");
CREATE INDEX IF NOT EXISTS "TaskActiveStage_status_idx"     ON "TaskActiveStage"("status");

DO $$ BEGIN
  ALTER TABLE "TaskActiveStage" ADD CONSTRAINT "TaskActiveStage_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TaskActiveStage" ADD CONSTRAINT "TaskActiveStage_stageId_fkey"
    FOREIGN KEY ("stageId") REFERENCES "TemplateStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TaskActiveStage" ADD CONSTRAINT "TaskActiveStage_assigneeId_fkey"
    FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

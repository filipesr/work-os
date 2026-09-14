-- REPARO (2): o resto do que `prisma db push` gravou no banco sem deixar migração.
--
-- A migração irmã (`20260626140000_repair_active_stage_objects`) devolveu ao histórico os objetos
-- SEM OS QUAIS ele nem replicava — `TaskActiveStage` e `ActiveStageStatus`. Com o replay voltando a
-- rodar de ponta a ponta, deu para perguntar ao Postgres o que mais faltava: `prisma migrate diff`
-- entre o histórico replicado e o schema apontou dezenove diferenças, todas da mesma origem.
--
-- Nada aqui muda o banco de produção: lá tudo isto já existe, porque foi `db push` quem escreveu.
-- Esta migração existe para que um banco NOVO — o shadow database de `migrate dev`, a máquina de
-- alguém que acabou de clonar, um ambiente de teste — chegue ao mesmo lugar pelo caminho versionado.
-- Por isso cada comando é idempotente: aplicar num banco que já tem tudo precisa ser um nada-a-fazer,
-- não um erro.

-- ── Enum que nunca foi criado ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Colunas que nasceram sem migração ───────────────────────────────────────────────────────────
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "email"       TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "phone"       TEXT;

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "admissionDate" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthday"      TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenAt"    TIMESTAMP(3);

ALTER TABLE "WorkflowTemplate"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ── Colunas que sumiram sem migração ────────────────────────────────────────────────────────────
-- `Task.currentStageId` era o ponteiro de etapa única, substituído por `TaskActiveStage` (uma
-- demanda tem VÁRIAS etapas ativas — fork/join). `User.teamId` era o vínculo de uma equipe só,
-- substituído pela junção `_UserTeams` abaixo.
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_currentStageId_fkey";
ALTER TABLE "Task" DROP COLUMN     IF EXISTS "currentStageId";

ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_teamId_fkey";
ALTER TABLE "User" DROP COLUMN     IF EXISTS "teamId";

-- ── Pessoa pertence a VÁRIAS equipes: a tabela de junção ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "_UserTeams" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_UserTeams_AB_pkey" PRIMARY KEY ("A", "B")
);
CREATE INDEX IF NOT EXISTS "_UserTeams_B_index" ON "_UserTeams"("B");

DO $$ BEGIN
  ALTER TABLE "_UserTeams" ADD CONSTRAINT "_UserTeams_A_fkey"
    FOREIGN KEY ("A") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "_UserTeams" ADD CONSTRAINT "_UserTeams_B_fkey"
    FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Índices de TaskActiveStage que só o schema conhecia ─────────────────────────────────────────
-- Os três compostos que as consultas quentes usam; os simples já vieram no reparo irmão.
CREATE INDEX IF NOT EXISTS "TaskActiveStage_assigneeId_status_idx"
  ON "TaskActiveStage"("assigneeId", "status");
CREATE INDEX IF NOT EXISTS "TaskActiveStage_stageId_assigneeId_status_idx"
  ON "TaskActiveStage"("stageId", "assigneeId", "status");
CREATE INDEX IF NOT EXISTS "TaskActiveStage_status_completedAt_idx"
  ON "TaskActiveStage"("status", "completedAt");

-- ── Chaves estrangeiras de TaskArtifact: a REGRA de apagamento divergia ─────────────────────────
-- O histórico as criava sem CASCADE; o schema pede CASCADE (apagar cliente ou projeto leva os
-- artefatos junto). Derrubar e recriar é o que o Prisma faria, e em produção chega ao mesmo estado
-- em que a coluna já está.
ALTER TABLE "TaskArtifact" DROP CONSTRAINT IF EXISTS "TaskArtifact_projectId_fkey";
ALTER TABLE "TaskArtifact" ADD  CONSTRAINT "TaskArtifact_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskArtifact" DROP CONSTRAINT IF EXISTS "TaskArtifact_clientId_fkey";
ALTER TABLE "TaskArtifact" ADD  CONSTRAINT "TaskArtifact_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exclusividade de tarefa em execução, agora expressável no schema do Prisma.
--
-- Substitui a garantia que vinha do índice parcial `ActivityLog_userId_open_key`
-- (migração 20260812160000). Aquele índice funciona, mas o Prisma não sabe
-- declará-lo: some do schema, `db push` não o recria e `migrate dev` o trata como
-- drift. Uma coluna anulável com `@unique` comum dá a MESMA garantia e é
-- versionada, gerada e reproduzível.
--
-- O índice parcial NÃO é derrubado aqui: continua como defesa redundante, e é o
-- que torna o backfill abaixo seguro — ele já garante que não existe pessoa com
-- dois períodos abertos, então o UPDATE não pode gerar duplicata.

ALTER TABLE "ActivityLog" ADD COLUMN "openForUserId" TEXT;

-- Períodos ABERTOS passam a declarar de quem são. Os fechados ficam nulos.
UPDATE "ActivityLog" SET "openForUserId" = "userId" WHERE "endedAt" IS NULL;

-- A garantia. Nulos não colidem no Postgres, então só as linhas abertas disputam.
CREATE UNIQUE INDEX "ActivityLog_openForUserId_key" ON "ActivityLog"("openForUserId");

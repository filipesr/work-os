-- Desativação de acesso do usuário. Null = ativo, que é o estado de todas as
-- linhas existentes — por isso não há backfill.
--
-- Timestamp em vez de booleano: a pergunta que se faz depois é "desde quando
-- esta pessoa não entra mais", e um booleano não responde.
ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);

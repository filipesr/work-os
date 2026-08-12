-- Calendário de datas como DADO, não como código.
--
-- As 41 datas/ano viviam só em lib/calendar/events.ts, o que impedia cadastrar
-- data local ou evento próprio (ex.: FestPop, que acontece duas vezes por ano em
-- datas anunciadas) sem um deploy.
--
-- Modelo OCORRÊNCIA-PRIMEIRO: cada edição anual é uma linha. "Dia das Crianças
-- 2026" e "2027" são registros distintos, então uma demanda vinculada a uma
-- edição não contamina a seguinte — e datas não-anuais cabem sem gambiarra.

CREATE TYPE "EventCountry" AS ENUM ('AR', 'BR', 'PY');
CREATE TYPE "OccurrenceKind" AS ENUM ('HOLIDAY', 'COMMERCIAL', 'EVENT');
CREATE TYPE "OccurrenceSource" AS ENUM ('CURATED', 'CUSTOM');

CREATE TABLE "CalendarOccurrence" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "titlePt" TEXT NOT NULL,
    "titleEs" TEXT NOT NULL,
    "kind" "OccurrenceKind" NOT NULL,
    "countries" "EventCountry"[],
    "seriesKey" TEXT,
    "source" "OccurrenceSource" NOT NULL DEFAULT 'CUSTOM',
    "curatedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarOccurrence_pkey" PRIMARY KEY ("id")
);

-- curatedId é a chave de deduplicação do materializador: rematerializar um ano
-- faz upsert por ela, então rodar duas vezes não duplica.
CREATE UNIQUE INDEX "CalendarOccurrence_curatedId_key" ON "CalendarOccurrence"("curatedId");
CREATE INDEX "CalendarOccurrence_date_idx" ON "CalendarOccurrence"("date");
CREATE INDEX "CalendarOccurrence_seriesKey_idx" ON "CalendarOccurrence"("seriesKey");

-- Vínculo da demanda com a data que ela atende. Null = demanda de rotina.
ALTER TABLE "Task" ADD COLUMN "calendarOccurrenceId" TEXT;
CREATE INDEX "Task_calendarOccurrenceId_idx" ON "Task"("calendarOccurrenceId");

-- SET NULL: apagar uma data do calendário não pode arrastar as demandas junto.
ALTER TABLE "Task"
  ADD CONSTRAINT "Task_calendarOccurrenceId_fkey"
  FOREIGN KEY ("calendarOccurrenceId") REFERENCES "CalendarOccurrence"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

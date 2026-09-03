-- Reserva da fila de importação. Nulo em toda linha existente: nenhum upload de navegador é
-- afetado (eles nascem sem `url`, e a fila só olha NAS_UPLOAD + PENDING + url não-nulo).
ALTER TABLE "TaskArtifact" ADD COLUMN "importClaimedAt" TIMESTAMP(3);

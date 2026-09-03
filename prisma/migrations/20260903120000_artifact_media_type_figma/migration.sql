-- FIGMA passa a ser tipo de mídia. Ele é SÓ DE LINK (não recebe arquivo no NAS), mas precisa
-- existir no enum porque link de Figma é o rótulo mais usado, e o `type` legado — que o tinha —
-- parou de ser gravado. Aditivo: nenhum dado existente muda.
ALTER TYPE "ArtifactMediaType" ADD VALUE IF NOT EXISTS 'FIGMA';

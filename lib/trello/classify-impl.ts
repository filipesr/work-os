import type { Card, CardNature, LabelsById } from "./types";

const SEPARADOR_PATTERN = /^[\s\-=_*.·—]+$|[⬆️👆👇⬇️☝]/;
// Ausência: aceita variações com e sem acentos, e português/espanhol
const AUSENCIA_PATTERN =
  /feriado|f[eé]rias|vacaciones|d[íi]a\s+(libre|livre)|sabado\s+(libre|livre)|s[áa]bado\s+(libre|livre)|reuni[óo]n|acompa[ñn]amiento|cumplea[ñn]os/i;
const REFERENCIA_START_PATTERN = /^(modelo|tama[ñn]o|accesso|acceso|checklist)/i;

export function cardNature(card: Card, labelsById: LabelsById): CardNature {
  const name = card.name || "";

  // 1. Separador: apenas espaços/símbolos ou contém emojis de seta
  if (SEPARADOR_PATTERN.test(name)) {
    return "separador";
  }

  // 2. Ausência: contém palavras de feriado/férias/reunião/etc
  if (AUSENCIA_PATTERN.test(name)) {
    return "ausencia";
  }

  // 3. Referência: começa com modelo/tamaño/acceso/checklist
  if (REFERENCIA_START_PATTERN.test(name)) {
    // Mas se tem anexo, é demanda (anexo é evidência de trabalho real)
    if (card.attachments && card.attachments.length > 0) {
      return "demanda";
    }
    return "referencia";
  }

  // 4. Referência: tem rótulo MODELO sem anexo
  const hasModeloLabel = card.idLabels?.some((id) => labelsById[id]?.toUpperCase() === "MODELO");
  if (hasModeloLabel && (!card.attachments || card.attachments.length === 0)) {
    return "referencia";
  }

  // 5. Demanda: tudo mais (ou MODELO com anexo)
  return "demanda";
}

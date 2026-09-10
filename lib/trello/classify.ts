export type { Card, CardNature, LabelsById } from "./types";

import type { Card, CardNature, LabelsById } from "./types";

const SOMENTE_SIMBOLOS_PATTERN = /^[\s\-=_*.·—]+$/;
const EMOJI_SETA = /[⬆️👆👇⬇️☝]/;
// Ausência: aceita variações com e sem acentos, e português/espanhol
const AUSENCIA_PATTERN =
  /feriado|f[eé]rias|vacaciones|d[íi]a\s+(libre|livre)|sabado\s+(libre|livre)|s[áa]bado\s+(libre|livre)|reuni[óo]n|acompa[ñn]amiento|cumplea[ñn]os/i;
const REFERENCIA_START_PATTERN = /^(modelo|tama[ñn]o|accesso|acceso|checklist)/i;

export function cardNature(card: Card, labelsById: LabelsById): CardNature {
  const name = card.name || "";
  const trimmed = name.trim();
  const hasAttachments = card.attachments && card.attachments.length > 0;

  // PRECEDÊNCIA quando há empate: separador > ausência > referência > demanda
  // Assim, separadores ocupam seu espaço sem ambiguidade.

  // 1. Separador: apenas espaços/símbolos OU começa/termina com emoji de seta
  if (SOMENTE_SIMBOLOS_PATTERN.test(trimmed) || isSeparadorPorEmoji(trimmed)) {
    return "separador";
  }

  // 2. Ausência: contém palavras de feriado/férias/reunião/etc
  // Mas se tem anexo, é demanda — o anexo é evidência de trabalho real
  if (AUSENCIA_PATTERN.test(name)) {
    if (hasAttachments) {
      return "demanda";
    }
    return "ausencia";
  }

  // 3. Referência: começa com modelo/tamaño/acceso/checklist
  if (REFERENCIA_START_PATTERN.test(name)) {
    // Mas se tem anexo, é demanda (anexo é evidência de trabalho real)
    if (hasAttachments) {
      return "demanda";
    }
    return "referencia";
  }

  // 4. Referência: tem rótulo MODELO sem anexo
  const hasModeloLabel = card.idLabels?.some((id) => labelsById[id]?.toUpperCase() === "MODELO");
  if (hasModeloLabel && !hasAttachments) {
    return "referencia";
  }

  // 5. Demanda: tudo mais (inclui MODELO com anexo)
  return "demanda";
}

/** Separador por emoji: começa ou termina com emoji de seta. */
function isSeparadorPorEmoji(name: string): boolean {
  const trimmed = name.trim();
  const firstChar = trimmed[0];
  const lastChar = trimmed[trimmed.length - 1];
  return EMOJI_SETA.test(firstChar) || EMOJI_SETA.test(lastChar);
}

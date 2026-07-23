import type { Tone } from "@/lib/status-tone";

// Formatação e tom do "aging" (idade da etapa vs SLA). A célula canônica é
// TEXTO ("20h / SLA 24h"), decidido a partir dos prints (2 de 3 telas usavam
// texto). Ver docs/arquitetura-de-informacao.md §6 (Tela 2/3).

/** Idade compacta: "6h", "1d 6h", "2d". */
export function formatAge(ageHours: number): string {
  const total = Math.max(0, Math.round(ageHours));
  if (total < 24) return `${total}h`;
  const days = Math.floor(total / 24);
  const hours = total % 24;
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

/** SLA compacto: "24h", "2d". */
export function formatSla(slaHours: number): string {
  if (slaHours % 24 === 0 && slaHours >= 24) return `${slaHours / 24}d`;
  return `${Math.round(slaHours)}h`;
}

/** Tom pelo consumo do SLA: <75% verde, 75–100% âmbar, ≥100% vermelho. */
export function agingTone(ratio: number): Tone {
  if (ratio >= 1) return "danger";
  if (ratio >= 0.75) return "warning";
  return "success";
}

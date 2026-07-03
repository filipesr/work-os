// Sensitivity × context matrix (spec §"Matriz de sensibilidade × contexto"). Pure policy helpers,
// unit-testable. RBAC (who / MEMBER+ with demand access) is enforced separately in the actions/routes
// layer via lib/permissions; this module answers only "does the sensitivity level permit this
// channel?".
//
//   Sensibilidade   | Download LAN (interno) | Download externo (túnel) | Share público
//   INTERNO         | Sim                    | Não                      | Não
//   CLIENTE         | Sim                    | Sim                      | Sim (senha opcional, expira)
//   CONFIDENCIAL    | Sim                    | Não                      | Não
//
// Fora da LAN: só CLIENTE. CONFIDENCIAL na v1 não adiciona verificação de papel além do acesso à
// demanda — sua proteção é não sair da LAN nem gerar link externo.

import type { SensitivityLevel } from "@prisma/client";

export type AccessChannel = "lan-download" | "tunnel-download" | "share";

/** Whether the sensitivity level permits access over the given channel. */
export function isChannelAllowed(sensitivity: SensitivityLevel, channel: AccessChannel): boolean {
  switch (channel) {
    case "lan-download":
      return true; // toda sensibilidade permite download interno na LAN (RBAC decide o "quem")
    case "tunnel-download":
    case "share":
      return sensitivity === "CLIENTE";
  }
}

/** External share links are only allowed for CLIENTE. */
export function canShare(sensitivity: SensitivityLevel): boolean {
  return sensitivity === "CLIENTE";
}

/** External (tunnel) download is only allowed for CLIENTE. */
export function canDownloadExternally(sensitivity: SensitivityLevel): boolean {
  return sensitivity === "CLIENTE";
}

/**
 * When sensitivity changes away from CLIENTE, active shares must be revoked (spec). Returns true
 * when a transition requires revoking existing share links.
 */
export function transitionRevokesShares(from: SensitivityLevel, to: SensitivityLevel): boolean {
  return from === "CLIENTE" && to !== "CLIENTE";
}

// Porta de autorização ÚNICA para os dados de presença (quem está online, em que
// tarefa, de qual cliente). NÃO é "use server": exporta um guard usado por
// server actions e rotas de API.
//
// Antes existiam duas barras para o mesmo dado — o board exigia
// `requireManagerOrAdmin`, a /tv só `requireMemberOrHigher` — então quem não
// podia abrir o board via a mesma informação pela TV. Um dado, um gate.

import { cookies } from "next/headers";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { env } from "@/lib/env";
import { WALLBOARD_COOKIE, verifyWallboardToken } from "@/lib/tv-wallboard";

/** O request carrega um cookie de wallboard válido? (conta de serviço da TV) */
export async function hasWallboardAccess(): Promise<boolean> {
  const token = (await cookies()).get(WALLBOARD_COOKIE)?.value;
  return verifyWallboardToken(token, env.TV_WALLBOARD_TOKEN);
}

/**
 * Autoriza a LEITURA de presença. Dois caminhos, mesmo dado:
 *  - wallboard: o monitor de parede, via cookie de conta de serviço;
 *  - humano: MANAGER/ADMIN (a barra do board — presença de colegas não é dado
 *    de consumo lateral, ver P1/P2).
 *
 * Lança quando nenhum dos dois vale, então todo caller é fail-closed por
 * omissão. O escopo do wallboard termina aqui: este guard só protege os três
 * getters de presença, nunca uma escrita.
 */
export async function requirePresenceRead(): Promise<void> {
  if (await hasWallboardAccess()) return;
  await requireManagerOrAdmin();
}

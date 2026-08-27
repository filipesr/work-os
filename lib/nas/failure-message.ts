// Tradução de um motivo de falha do probe do NAS para a mensagem que a pessoa lê na tela.
//
// Vive fora dos componentes porque os dois consumidores (envio e download) precisam do MESMO texto:
// o incidente de 26/08/2026 (certificado do agente vencido, tela dizendo "conecte-se à LAN/VPN")
// custou horas justamente por a mensagem não citar a causa nem o endereço para conferir. Manter isso
// em um lugar só evita que uma das telas volte a mentir enquanto a outra melhora.

import { NAS_ENDPOINT_CONFIG, type NasProbeFailure } from "@/lib/nas/endpoint";

/** Motivo → chave dentro do namespace `tasks.nasProbe`. Exportado para o teste conseguir provar que
 *  todo motivo tem texto nos dois locales — motivo sem tradução vira MISSING_MESSAGE em produção. */
export const NAS_FAILURE_MESSAGE_KEY: Record<NasProbeFailure, string> = {
  "not-configured": "notConfigured",
  timeout: "timeout",
  unreachable: "unreachable",
  blocked: "blocked",
  "http-error": "httpError",
  unhealthy: "unhealthy",
};

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Monta a mensagem do motivo. Sempre passa a URL do agente: abrir esse endereço no navegador é o
 * atalho que revela um certificado vencido em segundos — era o que faltava no dia do incidente.
 */
export function nasFailureMessage(t: Translate, failure: NasProbeFailure, status?: number): string {
  return t(NAS_FAILURE_MESSAGE_KEY[failure], {
    url: NAS_ENDPOINT_CONFIG.LAN_URL,
    status: status ?? "?",
  });
}

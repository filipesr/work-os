// O laço da importação: pergunta à nuvem o que há para baixar, baixa com as travas de rede,
// entrega os bytes à MESMA esteira do upload e reporta. Sai sempre daqui para lá — a Vercel não
// alcança o NAS.
//
// Um item que falha é reportado com motivo e sai da frente: numa migração inteira do Trello, um
// link quebrado no meio não pode parar a fila.

import path from "node:path";
import { safeResolve, type AgentConfig } from "./config.js";
import { fetchSource, FetchSourceError } from "./fetch-source.js";
import { storeStreamToNas, StoreError } from "./nas-store.js";
import { callFinalize, finalizeSignature } from "./finalize.js";

export interface ImportItem {
  artifactId: string;
  url: string;
  nasPath: string;
  fileName: string;
  mediaType: string;
  maxBytes: number;
}

// Guarda de processo: impede que duas rodadas concorrentes (o timer disparando antes da rodada
// anterior terminar) peguem o MESMO artefato duas vezes.
const emAndamento = new Set<string>();

/** Pergunta a fila com o mesmo HMAC do finalize. */
export async function pedirFila(cfg: AgentConfig): Promise<ImportItem[]> {
  if (!cfg.cloudImportQueueUrl || !cfg.finalizeSecret) return [];
  const body = JSON.stringify({ agentId: cfg.agentId });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const res = await fetch(cfg.cloudImportQueueUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-nas-timestamp": timestamp,
      "x-nas-signature": finalizeSignature(cfg.finalizeSecret, timestamp, body),
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { items?: ImportItem[] };
  return json.items ?? [];
}

// Traduz o motivo para o vocabulário que a tela sabe mostrar.
//   - FetchSourceError: os códigos já são o vocabulário do app, passam como estão.
//   - StoreError: TOO_LARGE e EXECUTABLE também já são o vocabulário do app. MAGIC_MISMATCH vira
//     NOT_A_FILE — para quem importou por link, "os bytes não batem com a extensão" só quer dizer
//     uma coisa: o link devolveu uma página, não o arquivo. Qualquer código que a esteira ganhe e
//     que não exista no vocabulário do app (ex.: ABORTED, uma desistência que não deveria
//     acontecer aqui, já que quem está do outro lado é o próprio agente, não um navegador) cai em
//     WRITE_FAILED em vez de vazar um código que a tela não sabe explicar.
//   - qualquer outro erro (disco cheio, etc.): WRITE_FAILED.
function motivoDe(err: unknown): string {
  if (err instanceof FetchSourceError) return err.code;
  if (err instanceof StoreError) {
    if (err.code === "TOO_LARGE" || err.code === "EXECUTABLE") return err.code;
    if (err.code === "MAGIC_MISMATCH") return "NOT_A_FILE";
    return "WRITE_FAILED";
  }
  return "WRITE_FAILED";
}

export interface ImportDeps {
  pedirFila: (cfg: AgentConfig) => Promise<ImportItem[]>;
  fetchSource: typeof fetchSource;
  storeStreamToNas: typeof storeStreamToNas;
  callFinalize: typeof callFinalize;
}

export async function runImportRound(
  cfg: AgentConfig,
  deps: ImportDeps
): Promise<{ processados: number; falhas: number }> {
  // Os três são exigidos juntos: sem os três, `finalizeCfg.url` abaixo seria `undefined` e uma
  // falha seria relatada para lugar nenhum.
  if (!cfg.cloudImportQueueUrl || !cfg.finalizeSecret || !cfg.cloudFinalizeUrl) {
    return { processados: 0, falhas: 0 };
  }
  const finalizeCfg = {
    url: cfg.cloudFinalizeUrl,
    secret: cfg.finalizeSecret,
    agentId: cfg.agentId,
  };

  const itens = (await deps.pedirFila(cfg)).filter((i) => !emAndamento.has(i.artifactId));
  let processados = 0;
  let falhas = 0;

  for (const item of itens) {
    emAndamento.add(item.artifactId);
    try {
      const finalPath = safeResolve(cfg.nasRoot, item.nasPath);
      const { body } = await deps.fetchSource(item.url, {
        maxBytes: Math.min(item.maxBytes, cfg.maxUploadBytes),
      });
      const stored = await deps.storeStreamToNas({
        source: body,
        finalPath,
        tmpPath: `${finalPath}.importing-${item.artifactId}.tmp`,
        maxBytes: Math.min(item.maxBytes, cfg.maxUploadBytes),
        ext: path.extname(item.fileName).slice(1).toLowerCase(),
        hashMode: cfg.hashMode,
      });
      await deps.callFinalize(
        finalizeCfg,
        { artifactId: item.artifactId, checksum: stored.checksum, sizeBytes: stored.bytes },
        { retries: 3 }
      );
      processados++;
    } catch (err) {
      falhas++;
      await deps.callFinalize(
        finalizeCfg,
        {
          artifactId: item.artifactId,
          failed: true,
          reason: motivoDe(err),
          detail: (err as Error).message,
        },
        { retries: 3 }
      );
    } finally {
      emAndamento.delete(item.artifactId);
    }
  }
  return { processados, falhas };
}

/** Liga o laço. Sem URL de fila, não faz nada — é o que permite agente antigo e app novo. */
export function startImportWorker(
  cfg: AgentConfig,
  log: { warn: (o: unknown, m: string) => void }
) {
  if (!cfg.cloudImportQueueUrl || !cfg.finalizeSecret || !cfg.cloudFinalizeUrl) return null;
  const deps: ImportDeps = { pedirFila, fetchSource, storeStreamToNas, callFinalize };
  const timer = setInterval(() => {
    void runImportRound(cfg, deps).catch((e) =>
      log.warn({ err: (e as Error).message }, "rodada de importação falhou")
    );
  }, cfg.importPollMs);
  timer.unref?.();
  return timer;
}

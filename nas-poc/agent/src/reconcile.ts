// Pull-reconcile: o APP manda {artifactId, nasPath} (ele é a fonte de verdade do caminho) e o agente
// reporta presença + tamanho do arquivo FINAL no disco. Serve para recuperar uploads cujo push de
// finalize falhou (arquivo bom no NAS mas nunca marcado READY) sem falseá-los como FAILED, e para
// expirar com segurança os que realmente não chegaram.

import { stat } from "node:fs/promises";
import { safeResolve } from "./config.js";

export interface StatusItem {
  artifactId: string;
  nasPath: string;
}

export interface StatusResult {
  artifactId: string;
  exists: boolean;
  sizeBytes: number | null;
}

/** Checa cada item contra o disco, sob nasRoot (safeResolve). Path inválido/escape ou ENOENT →
 *  exists:false (do ponto de vista do reconcile, "não chegou"). Nunca lança. */
export async function checkArtifactFiles(
  nasRoot: string,
  items: StatusItem[]
): Promise<StatusResult[]> {
  const out: StatusResult[] = [];
  for (const it of items) {
    if (!it || !it.artifactId || !it.nasPath) continue;
    let exists = false;
    let sizeBytes: number | null = null;
    try {
      const abs = safeResolve(nasRoot, it.nasPath);
      const st = await stat(abs);
      exists = st.isFile();
      sizeBytes = exists ? st.size : null;
    } catch {
      /* ENOENT ou path inválido/escape — trata como ausente */
    }
    out.push({ artifactId: it.artifactId, exists, sizeBytes });
  }
  return out;
}

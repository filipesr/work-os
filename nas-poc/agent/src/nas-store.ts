// Esteira de gravação única: tmp -> corte por tamanho DURANTE o fluxo -> sniff dos primeiros bytes
// -> rename atômico -> checksum conforme o modo. Usada hoje pelo upload; a importação por link vai
// chamar o MESMO código, não uma cópia — é assim que ela herda as travas em vez de reescrevê-las.
//
// A ordem não pode mudar: publicar antes do sniff é publicar um arquivo mal-rotulado por alguns
// milissegundos, e é a diferença entre uma trava e um aviso.

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import path from "node:path";
import { sniffUpload, SniffError } from "./sniff.js";
import type { HashMode } from "./config.js";

export type StoreFailureCode =
  | "TOO_LARGE"
  | "EXECUTABLE"
  | "MAGIC_MISMATCH"
  | "WRITE_FAILED"
  | "ABORTED";

export class StoreError extends Error {
  constructor(
    public code: StoreFailureCode,
    message: string
  ) {
    super(message);
    this.name = "StoreError";
  }
}

export interface StoreStreamInput {
  source: AsyncIterable<Uint8Array>;
  finalPath: string;
  tmpPath: string;
  maxBytes: number;
  ext: string;
  hashMode: HashMode;
}

export interface StoreStreamResult {
  bytes: number;
  checksum: string | null;
  msWrite: number;
  msHash: number;
}

export async function storeStreamToNas(input: StoreStreamInput): Promise<StoreStreamResult> {
  const { source, finalPath, tmpPath, maxBytes, ext, hashMode } = input;

  await mkdir(path.dirname(finalPath), { recursive: true });

  const hash = hashMode === "off" ? null : createHash("sha256");
  const ws = createWriteStream(tmpPath);
  let bytes = 0;
  const tWrite = Date.now();

  try {
    let tooLarge = false;
    for await (const chunk of source) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        tooLarge = true;
        break; // para de consumir a fonte NO MEIO — não drena o resto antes de reclamar.
      }
      if (hashMode === "inline" && hash) hash.update(chunk);
      if (!ws.write(chunk)) await once(ws, "drain");
    }
    if (tooLarge) {
      ws.destroy();
      await safeUnlink(tmpPath);
      throw new StoreError("TOO_LARGE", `upload excede o limite de ${maxBytes} bytes`);
    }
    ws.end();
    await finished(ws);
  } catch (err) {
    if (err instanceof StoreError) throw err;
    // A fonte (ou o próprio stream de escrita) falhou no meio — na prática isso é quase sempre o
    // cliente desistindo (aba fechada, conexão caída). Marcamos com um código próprio (ABORTED)
    // para não se confundir, lá no chamador, com um erro genérico do NAS (disco cheio, EMFILE,
    // falha de I/O) — essas duas causas pedem reação bem diferente e não podem virar a mesma
    // mensagem de log.
    ws.destroy();
    await safeUnlink(tmpPath);
    throw new StoreError("ABORTED", (err as Error).message);
  }
  const msWrite = Date.now() - tWrite;

  // Sniffing dos primeiros bytes ANTES de publicar — nunca publica um arquivo mal-rotulado.
  try {
    const fh = await open(tmpPath, "r");
    const headBuf = Buffer.alloc(256);
    const { bytesRead } = await fh.read(headBuf, 0, 256, 0);
    await fh.close();
    sniffUpload(headBuf.subarray(0, bytesRead), ext);
  } catch (err) {
    if (err instanceof SniffError) {
      await safeUnlink(tmpPath);
      throw new StoreError(err.code, err.message);
    }
    // Erro genérico do NAS (EMFILE, EACCES, I/O) ao abrir/ler o tmp para o sniff — não é o cliente
    // desistindo, é o storage falhando. Propaga o erro ORIGINAL (não StoreError) para que o
    // handler deixe o Fastify responder 500 em vez de disfarçar de "upload aborted". Ainda assim
    // limpamos o tmp aqui — melhoria sobre o código antigo, que deixava esse arquivo para trás
    // nesse caminho e dependia só do reconcile como rede de segurança.
    await safeUnlink(tmpPath);
    throw err;
  }

  // Atomic publish.
  await rename(tmpPath, finalPath);

  // Checksum according to the measurement mode.
  let checksum: string | null = null;
  let msHash = 0;
  if (hashMode === "inline" && hash) {
    checksum = hash.digest("hex");
  } else if (hashMode === "deferred") {
    const tHash = Date.now();
    checksum = await hashFile(finalPath);
    msHash = Date.now() - tHash;
  }

  return { bytes, checksum, msWrite, msHash };
}

export async function safeUnlink(p: string): Promise<void> {
  try {
    await rm(p, { force: true });
  } catch {
    /* ignore */
  }
}

export async function hashFile(p: string): Promise<string> {
  const h = createHash("sha256");
  await finished(createReadStream(p).on("data", (c) => h.update(c)));
  return h.digest("hex");
}

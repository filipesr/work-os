import { describe, it, expect, vi } from "vitest";
import type { AgentConfig } from "../src/config.js";
import { FetchSourceError } from "../src/fetch-source.js";
import { StoreError } from "../src/nas-store.js";
import { runImportRound, type ImportItem, type ImportDeps } from "../src/import-worker.js";

function cfgBase(): AgentConfig {
  return {
    agentId: "agent-1",
    version: "0.1.0",
    nasRoot: "/data",
    lanPort: 8080,
    lanHost: "0.0.0.0",
    tunnelPort: 8081,
    tunnelHost: "127.0.0.1",
    maxUploadBytes: 5 * 1024 * 1024 * 1024,
    hashMode: "inline",
    allowedOrigins: ["*"],
    tokenPublicKeysRaw: "[]",
    cloudFinalizeUrl: "http://cloud/api/artifacts/finalize",
    finalizeSecret: "s3cr3t",
    stateDir: "/data/.agent-state",
    tmpTtlMs: 24 * 60 * 60 * 1000,
    cloudImportQueueUrl: "http://cloud/api/artifacts/import-queue",
    importPollMs: 60_000,
  };
}

const item: ImportItem = {
  artifactId: "art1",
  url: "https://exemplo.com/foto.jpg",
  nasPath: "Cliente/Institucional/fotos/a_v01.jpg",
  fileName: "a_v01.jpg",
  mediaType: "FOTOS",
  maxBytes: 150 * 1024 * 1024,
};

async function* corpo(): AsyncIterable<Uint8Array> {
  yield new Uint8Array([1, 2, 3]);
}

function depsBase(overrides: Partial<ImportDeps> = {}): ImportDeps {
  return {
    pedirFila: async () => [item],
    fetchSource: vi.fn(async () => ({ body: corpo(), finalUrl: item.url })) as any,
    storeStreamToNas: vi.fn(async () => ({
      bytes: 42,
      checksum: "abc",
      msWrite: 1,
      msHash: 0,
    })) as any,
    callFinalize: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

describe("runImportRound", () => {
  it("baixa, grava e reporta sucesso", async () => {
    const finalize = vi.fn().mockResolvedValue({ ok: true });
    const r = await runImportRound(
      cfgBase(),
      depsBase({
        pedirFila: async () => [item],
        fetchSource: async () => ({ body: corpo(), finalUrl: item.url }),
        storeStreamToNas: async () =>
          ({ bytes: 42, checksum: "abc", msWrite: 1, msHash: 0 }) as any,
        callFinalize: finalize,
      })
    );
    expect(r.processados).toBe(1);
    expect(r.falhas).toBe(0);
    expect(finalize).toHaveBeenCalledWith(
      expect.anything(),
      { artifactId: "art1", checksum: "abc", sizeBytes: 42 },
      expect.anything()
    );
  });

  it("reporta falha com o código quando a origem é privada", async () => {
    const finalize = vi.fn().mockResolvedValue({ ok: true });
    const r = await runImportRound(
      cfgBase(),
      depsBase({
        pedirFila: async () => [item],
        fetchSource: async () => {
          throw new FetchSourceError("PRIVATE_HOST", "x");
        },
        storeStreamToNas: vi.fn() as any,
        callFinalize: finalize,
      })
    );
    expect(r.processados).toBe(0);
    expect(r.falhas).toBe(1);
    expect(finalize).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ artifactId: "art1", failed: true, reason: "PRIVATE_HOST" }),
      expect.anything()
    );
  });

  it("reporta falha da esteira com o código dela (arquivo maior que o teto)", async () => {
    const finalize = vi.fn().mockResolvedValue({ ok: true });
    const r = await runImportRound(
      cfgBase(),
      depsBase({
        pedirFila: async () => [item],
        fetchSource: async () => ({ body: corpo(), finalUrl: item.url }),
        storeStreamToNas: async () => {
          throw new StoreError("TOO_LARGE", "excede o teto");
        },
        callFinalize: finalize,
      })
    );
    expect(r.falhas).toBe(1);
    expect(finalize).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ artifactId: "art1", failed: true, reason: "TOO_LARGE" }),
      expect.anything()
    );
  });

  it("EXECUTABLE da esteira mantém o próprio nome", async () => {
    const finalize = vi.fn().mockResolvedValue({ ok: true });
    await runImportRound(
      cfgBase(),
      depsBase({
        storeStreamToNas: async () => {
          throw new StoreError("EXECUTABLE", "binário recusado");
        },
        callFinalize: finalize,
      })
    );
    expect(finalize).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reason: "EXECUTABLE" }),
      expect.anything()
    );
  });

  it("MAGIC_MISMATCH da esteira vira NOT_A_FILE (o link devolveu página, não arquivo)", async () => {
    const finalize = vi.fn().mockResolvedValue({ ok: true });
    await runImportRound(
      cfgBase(),
      depsBase({
        storeStreamToNas: async () => {
          throw new StoreError("MAGIC_MISMATCH", "bytes não conferem com a extensão");
        },
        callFinalize: finalize,
      })
    );
    expect(finalize).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reason: "NOT_A_FILE" }),
      expect.anything()
    );
  });

  it("ABORTED da esteira (código sem vocabulário no app) cai em WRITE_FAILED", async () => {
    const finalize = vi.fn().mockResolvedValue({ ok: true });
    await runImportRound(
      cfgBase(),
      depsBase({
        storeStreamToNas: async () => {
          throw new StoreError("ABORTED", "desistência");
        },
        callFinalize: finalize,
      })
    );
    expect(finalize).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reason: "WRITE_FAILED" }),
      expect.anything()
    );
  });

  it("um erro inesperado vira WRITE_FAILED, e não um item preso para sempre", async () => {
    const finalize = vi.fn().mockResolvedValue({ ok: true });
    const r = await runImportRound(
      cfgBase(),
      depsBase({
        pedirFila: async () => [item],
        fetchSource: async () => ({ body: corpo(), finalUrl: item.url }),
        storeStreamToNas: async () => {
          throw new Error("disco cheio");
        },
        callFinalize: finalize,
      })
    );
    expect(r.falhas).toBe(1);
    expect(finalize).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ artifactId: "art1", failed: true, reason: "WRITE_FAILED" }),
      expect.anything()
    );
  });

  it("não processa o mesmo artefato duas vezes ao mesmo tempo", async () => {
    const finalize = vi.fn().mockResolvedValue({ ok: true });
    let fetchCalls = 0;
    let liberar: () => void = () => {};
    const portao = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const fetchSourceMock = vi.fn(async () => {
      fetchCalls++;
      await portao;
      return { body: corpo(), finalUrl: item.url };
    });
    const deps = depsBase({
      pedirFila: async () => [item],
      fetchSource: fetchSourceMock as any,
      storeStreamToNas: async () => ({ bytes: 1, checksum: "z", msWrite: 0, msHash: 0 }) as any,
      callFinalize: finalize,
    });

    const p1 = runImportRound(cfgBase(), deps);
    const p2 = runImportRound(cfgBase(), deps);
    liberar();
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(fetchCalls).toBe(1);
    expect(r1.processados + r2.processados).toBe(1);
  });

  it("uma falha não impede o item seguinte", async () => {
    const item2: ImportItem = { ...item, artifactId: "art2" };
    const finalize = vi.fn().mockResolvedValue({ ok: true });
    const fetchSourceMock = vi
      .fn()
      .mockRejectedValueOnce(new FetchSourceError("TIMEOUT", "a origem não respondeu"))
      .mockResolvedValueOnce({ body: corpo(), finalUrl: item2.url });

    const r = await runImportRound(
      cfgBase(),
      depsBase({
        pedirFila: async () => [item, item2],
        fetchSource: fetchSourceMock as any,
        storeStreamToNas: async () => ({ bytes: 7, checksum: "ok2", msWrite: 0, msHash: 0 }) as any,
        callFinalize: finalize,
      })
    );

    expect(r.processados).toBe(1);
    expect(r.falhas).toBe(1);
    expect(finalize).toHaveBeenCalledTimes(2);
    expect(finalize).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ artifactId: "art1", failed: true, reason: "TIMEOUT" }),
      expect.anything()
    );
    expect(finalize).toHaveBeenCalledWith(
      expect.anything(),
      { artifactId: "art2", checksum: "ok2", sizeBytes: 7 },
      expect.anything()
    );
  });

  it("sem URL de fila configurada, a rodada não faz nada", async () => {
    const pedirFila = vi.fn();
    const r = await runImportRound(
      { ...cfgBase(), cloudImportQueueUrl: undefined },
      depsBase({ pedirFila })
    );
    expect(pedirFila).not.toHaveBeenCalled();
    expect(r).toEqual({ processados: 0, falhas: 0 });
  });

  it("sem cloudFinalizeUrl configurado, a rodada não faz nada (não relata falha para undefined)", async () => {
    const pedirFila = vi.fn();
    const r = await runImportRound(
      { ...cfgBase(), cloudFinalizeUrl: undefined },
      depsBase({ pedirFila })
    );
    expect(pedirFila).not.toHaveBeenCalled();
    expect(r).toEqual({ processados: 0, falhas: 0 });
  });

  it("sem finalizeSecret configurado, a rodada não faz nada", async () => {
    const pedirFila = vi.fn();
    const r = await runImportRound(
      { ...cfgBase(), finalizeSecret: undefined },
      depsBase({ pedirFila })
    );
    expect(pedirFila).not.toHaveBeenCalled();
    expect(r).toEqual({ processados: 0, falhas: 0 });
  });
});

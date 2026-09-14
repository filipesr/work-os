import { describe, it, expect, vi, afterEach } from "vitest";
import type { AgentConfig } from "../src/config.js";
import { FetchSourceError } from "../src/fetch-source.js";
import { StoreError } from "../src/nas-store.js";
import {
  runImportRound,
  pedirFila,
  type ImportItem,
  type ImportDeps,
} from "../src/import-worker.js";

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
    enqueueFinalize: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// Revisão final, item 2: a fila rejeitada é silenciosa hoje (`if (!res.ok) return [];`, sem log e
// sem distinção). 401 (segredo diferente entre Vercel e NAS), 404 (app antigo) e 503 (segredo
// ausente na nuvem) ficam indistinguíveis de "fila vazia" — e são o sintoma exato do dia da virada.
describe("pedirFila", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("registra um aviso com o status quando a resposta não é 2xx (não fica muda)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401 }) as Response)
    );
    const warn = vi.fn();
    const itens = await pedirFila(cfgBase(), { warn });
    expect(itens).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }), expect.any(String));
  });

  it("fila vazia (2xx sem itens) não registra aviso — só o não-2xx é mudo demais para ficar quieto", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) }) as Response)
    );
    const warn = vi.fn();
    const itens = await pedirFila(cfgBase(), { warn });
    expect(itens).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("sem logger, não quebra (o parâmetro é opcional)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503 }) as Response)
    );
    await expect(pedirFila(cfgBase())).resolves.toEqual([]);
  });

  it("[CRÍTICO] nuvem INALCANÇÁVEL devolve lista vazia e avisa — não derruba a rodada", async () => {
    // Deploy em andamento, rede do escritório fora, DNS falhando: o `fetch` LANÇA, não devolve
    // não-2xx. Sem tratamento, a exceção subia até o `catch` do intervalo e virava "rodada de
    // importação falhou" — que não distingue "não consegui nem PERGUNTAR" de "falhei processando
    // um item". São diagnósticos diferentes e levam a lugares diferentes.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      })
    );
    const warn = vi.fn();

    const itens = await pedirFila(cfgBase(), { warn });

    expect(itens).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: "ECONNREFUSED" }),
      expect.stringContaining("inalcançável")
    );
  });

  it("nuvem inalcançável sem logger também não quebra", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ETIMEDOUT");
      })
    );
    await expect(pedirFila(cfgBase())).resolves.toEqual([]);
  });
});

describe("runImportRound", () => {
  it("baixa, grava e reporta sucesso", async () => {
    const finalize = vi.fn().mockResolvedValue({ ok: true });
    const enqueueFinalize = vi.fn().mockResolvedValue(undefined);
    const r = await runImportRound(
      cfgBase(),
      depsBase({
        pedirFila: async () => [item],
        fetchSource: async () => ({ body: corpo(), finalUrl: item.url }),
        storeStreamToNas: async () =>
          ({ bytes: 42, checksum: "abc", msWrite: 1, msHash: 0 }) as any,
        callFinalize: finalize,
        enqueueFinalize,
      })
    );
    expect(r.processados).toBe(1);
    expect(r.falhas).toBe(0);
    expect(finalize).toHaveBeenCalledWith(
      expect.anything(),
      { artifactId: "art1", checksum: "abc", sizeBytes: 42 },
      expect.anything()
    );
    // callFinalize teve sucesso — não há relato perdido, então nada vai para a fila persistente.
    expect(enqueueFinalize).not.toHaveBeenCalled();
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

  // Revisão final, item crítico: a origem que trava DURANTE a gravação (a esteira consome o body
  // de fetchSource dentro de storeStreamToNas) tem código PRÓPRIO — não pode virar ABORTED nem
  // WRITE_FAILED, ou a tela mente sobre "não foi possível gravar" quando o problema é tempo.
  it("SOURCE_STALLED da esteira (origem travou no meio do download) mantém o próprio código", async () => {
    const finalize = vi.fn().mockResolvedValue({ ok: true });
    await runImportRound(
      cfgBase(),
      depsBase({
        storeStreamToNas: async () => {
          throw new FetchSourceError("SOURCE_STALLED", "a origem parou de mandar bytes");
        },
        callFinalize: finalize,
      })
    );
    expect(finalize).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reason: "SOURCE_STALLED" }),
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

  it("[CRÍTICO] com DOIS itens, rodadas concorrentes não dividem nem repetem o trabalho", async () => {
    // O teste de um item só passa por acidente de ordenação: quando a segunda rodada monta a
    // lista, o único item já está marcado. Com dois, o buraco aparece — e é o caso real, porque a
    // fila devolve um lote.
    //
    // Rodada 1 pega A e trava no download. Rodada 2 monta a lista: A está marcado (filtrado), B
    // não — então ela começa B. Rodada 1 termina A e vai para B, que ela NÃO reconfere, porque a
    // conferência aconteceu lá atrás, na montagem da lista. Os dois baixam B ao mesmo tempo, para
    // o MESMO caminho no NAS.
    const itemB: ImportItem = { ...item, artifactId: "art2" };
    const baixados: string[] = [];
    const portoes = new Map<string, Promise<void>>();
    const liberadores = new Map<string, () => void>();
    for (const id of ["art1", "art2"]) {
      portoes.set(id, new Promise<void>((r) => liberadores.set(id, r)));
    }
    let n = 0;
    const fetchSourceMock = vi.fn(async () => {
      // A fila devolve os dois na mesma ordem; a chamada n-ésima corresponde ao item n-ésimo.
      const id = n++ === 0 ? "art1" : "art2";
      baixados.push(id);
      await portoes.get(id)!;
      return { body: corpo(), finalUrl: item.url };
    });
    const deps = depsBase({
      pedirFila: async () => [item, itemB],
      fetchSource: fetchSourceMock as any,
      storeStreamToNas: async () => ({ bytes: 1, checksum: "z", msWrite: 0, msHash: 0 }) as any,
      callFinalize: vi.fn().mockResolvedValue({ ok: true }),
    });

    const p1 = runImportRound(cfgBase(), deps);
    const p2 = runImportRound(cfgBase(), deps);
    liberadores.get("art1")!();
    liberadores.get("art2")!();
    const [r1, r2] = await Promise.all([p1, p2]);

    // Cada artefato baixado UMA vez, não importa como o trabalho se dividiu entre as rodadas.
    expect(baixados.filter((x) => x === "art1")).toHaveLength(1);
    expect(baixados.filter((x) => x === "art2")).toHaveLength(1);
    expect(r1.processados + r2.processados).toBe(2);
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

  // Rodada de conserto 1: nuvem fora do ar (os 3 retries do callFinalize se esgotam) não pode
  // apagar o relato. O agente já resolveu isso para o upload com a fila persistente — o import
  // reusa a MESMA fila via enqueueFinalize.
  describe("callFinalize esgota os retries — o relato vai para a fila persistente", () => {
    it("ramo de SUCESSO: enfileira o job com checksum e tamanho", async () => {
      const enqueueFinalize = vi.fn().mockResolvedValue(undefined);
      const callFinalize = vi.fn().mockResolvedValue({ ok: false, error: "nuvem fora do ar" });
      const r = await runImportRound(
        cfgBase(),
        depsBase({
          pedirFila: async () => [item],
          fetchSource: async () => ({ body: corpo(), finalUrl: item.url }),
          storeStreamToNas: async () =>
            ({ bytes: 42, checksum: "abc", msWrite: 1, msHash: 0 }) as any,
          callFinalize,
          enqueueFinalize,
        })
      );
      // O arquivo FOI gravado — não é uma falha de import, é um relato perdido.
      expect(r.processados).toBe(1);
      expect(enqueueFinalize).toHaveBeenCalledWith({
        artifactId: "art1",
        checksum: "abc",
        sizeBytes: 42,
      });
    });

    it("ramo de FALHA: enfileira o job com o motivo (reason)", async () => {
      const enqueueFinalize = vi.fn().mockResolvedValue(undefined);
      const callFinalize = vi.fn().mockResolvedValue({ ok: false, error: "nuvem fora do ar" });
      const r = await runImportRound(
        cfgBase(),
        depsBase({
          pedirFila: async () => [item],
          fetchSource: async () => {
            throw new FetchSourceError("PRIVATE_HOST", "x");
          },
          storeStreamToNas: vi.fn() as any,
          callFinalize,
          enqueueFinalize,
        })
      );
      expect(r.falhas).toBe(1);
      expect(enqueueFinalize).toHaveBeenCalledWith(
        expect.objectContaining({ artifactId: "art1", failed: true, reason: "PRIVATE_HOST" })
      );
    });

    it("depois de enfileirado, o emAndamento foi limpo — o item não fica travado para sempre", async () => {
      const enqueueFinalize = vi.fn().mockResolvedValue(undefined);
      const callFinalize = vi.fn().mockResolvedValue({ ok: false, error: "nuvem fora do ar" });
      const fetchSourceMock = vi.fn(async () => ({ body: corpo(), finalUrl: item.url }));
      const deps = depsBase({
        pedirFila: async () => [item],
        fetchSource: fetchSourceMock as any,
        storeStreamToNas: async () => ({ bytes: 1, checksum: "z", msWrite: 0, msHash: 0 }) as any,
        callFinalize,
        enqueueFinalize,
      });

      await runImportRound(cfgBase(), deps); // 1ª rodada: callFinalize falha, item enfileirado
      await runImportRound(cfgBase(), deps); // 2ª rodada: o MESMO item aparece na fila de novo

      // Se emAndamento não tivesse sido limpo no `finally`, a 2ª rodada filtraria o item e
      // fetchSource seria chamado só 1 vez.
      expect(fetchSourceMock).toHaveBeenCalledTimes(2);
      expect(enqueueFinalize).toHaveBeenCalledTimes(2);
    });
  });
});

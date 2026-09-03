import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { storeStreamToNas, StoreError } from "../src/nas-store";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "agent-nas-store-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function* bytes(...chunks: Buffer[]) {
  for (const c of chunks) yield c;
}
const PNG = Buffer.from("89504e470d0a1a0a", "hex");

describe("storeStreamToNas", () => {
  it("grava, devolve o tamanho e o sha256", async () => {
    const finalPath = path.join(dir, "a.png");
    const tmpPath = path.join(dir, "a.png.tmp");
    const r = await storeStreamToNas({
      source: bytes(PNG, Buffer.alloc(10)),
      finalPath,
      tmpPath,
      maxBytes: 1000,
      ext: "png",
      hashMode: "inline",
    });
    expect(r.bytes).toBe(PNG.length + 10);
    expect(r.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(finalPath)).toBe(true);
    expect(existsSync(tmpPath)).toBe(false);
  });

  it("corta DURANTE o fluxo e não deixa arquivo para trás", async () => {
    // 3 pedaços de 100 bytes com teto de 150: o erro precisa vir antes do terceiro.
    let entregues = 0;
    async function* fonte() {
      for (let i = 0; i < 3; i++) {
        entregues++;
        yield Buffer.alloc(100);
      }
    }
    const finalPath = path.join(dir, "b.png");
    const tmpPath = path.join(dir, "b.png.tmp");
    await expect(
      storeStreamToNas({
        source: fonte(),
        finalPath,
        tmpPath,
        maxBytes: 150,
        ext: "png",
        hashMode: "off",
      })
    ).rejects.toMatchObject({ code: "TOO_LARGE" });
    expect(entregues).toBeLessThan(3); // parou no meio, não depois de baixar tudo
    expect(existsSync(finalPath)).toBe(false);
    expect(existsSync(tmpPath)).toBe(false);
  });

  it("recusa executável disfarçado e não publica", async () => {
    const finalPath = path.join(dir, "c.png");
    const tmpPath = path.join(dir, "c.png.tmp");
    await expect(
      storeStreamToNas({
        source: bytes(Buffer.from("4d5a9000", "hex")),
        finalPath,
        tmpPath,
        maxBytes: 1000,
        ext: "png",
        hashMode: "off",
      })
    ).rejects.toMatchObject({ code: "EXECUTABLE" });
    expect(existsSync(finalPath)).toBe(false);
    expect(existsSync(tmpPath)).toBe(false);
  });

  it("recusa bytes que não conferem com a extensão", async () => {
    const finalPath = path.join(dir, "d.png");
    const tmpPath = path.join(dir, "d.png.tmp");
    await expect(
      storeStreamToNas({
        source: bytes(Buffer.from("<html>")),
        finalPath,
        tmpPath,
        maxBytes: 1000,
        ext: "png",
        hashMode: "off",
      })
    ).rejects.toMatchObject({ code: "MAGIC_MISMATCH" });
    expect(existsSync(finalPath)).toBe(false);
    expect(existsSync(tmpPath)).toBe(false);
  });

  it("hashMode off não calcula checksum", async () => {
    const finalPath = path.join(dir, "e.png");
    const tmpPath = path.join(dir, "e.png.tmp");
    const r = await storeStreamToNas({
      source: bytes(PNG),
      finalPath,
      tmpPath,
      maxBytes: 1000,
      ext: "png",
      hashMode: "off",
    });
    expect(r.checksum).toBeNull();
  });

  it("hashMode deferred calcula o checksum depois da publicação", async () => {
    const finalPath = path.join(dir, "f.png");
    const tmpPath = path.join(dir, "f.png.tmp");
    const r = await storeStreamToNas({
      source: bytes(PNG),
      finalPath,
      tmpPath,
      maxBytes: 1000,
      ext: "png",
      hashMode: "deferred",
    });
    expect(r.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("lança StoreError com code e o erro é instância de StoreError", async () => {
    const finalPath = path.join(dir, "g.png");
    const tmpPath = path.join(dir, "g.png.tmp");
    try {
      await storeStreamToNas({
        source: bytes(Buffer.from("4d5a9000", "hex")),
        finalPath,
        tmpPath,
        maxBytes: 1000,
        ext: "png",
        hashMode: "off",
      });
      expect.unreachable("deveria ter lançado");
    } catch (err) {
      expect(err).toBeInstanceOf(StoreError);
      expect((err as StoreError).code).toBe("EXECUTABLE");
    }
  });

  it("fonte que aborta DURANTE a escrita vira StoreError ABORTED (cliente desistiu)", async () => {
    const finalPath = path.join(dir, "h.png");
    const tmpPath = path.join(dir, "h.png.tmp");
    async function* fonte() {
      yield Buffer.alloc(10);
      throw new Error("ECONNRESET simulado — cliente fechou a conexão");
    }
    let caught: unknown;
    try {
      await storeStreamToNas({
        source: fonte(),
        finalPath,
        tmpPath,
        maxBytes: 1000,
        ext: "png",
        hashMode: "off",
      });
      expect.unreachable("deveria ter lançado");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(StoreError);
    expect((caught as StoreError).code).toBe("ABORTED");
    expect(existsSync(finalPath)).toBe(false);
    expect(existsSync(tmpPath)).toBe(false);
  });

  it("erro genérico do NAS durante o sniff (não é desistência do cliente) propaga o erro original, não StoreError", async () => {
    const finalPath = path.join(dir, "i.png");
    const tmpPath = path.join(dir, "i.png.tmp");
    // Simula uma falha real de I/O do NAS entre a escrita e o sniff: o tmp some do caminho antes
    // do open() de leitura (ENOENT genérico — não é o cliente que desistiu, é o disco/FS falhando).
    async function* fonte() {
      yield PNG;
      await rm(tmpPath, { force: true });
    }
    let caught: unknown;
    try {
      await storeStreamToNas({
        source: fonte(),
        finalPath,
        tmpPath,
        maxBytes: 1000,
        ext: "png",
        hashMode: "off",
      });
      expect.unreachable("deveria ter lançado");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught).not.toBeInstanceOf(StoreError);
  });

  it("msWrite/msHash: deferred mede o hash separado (>0), off fica zero", async () => {
    const big = Buffer.alloc(48 * 1024 * 1024); // grande o bastante pra hash não zerar no relógio de ms

    const finalOff = path.join(dir, "off.bin");
    const tmpOff = path.join(dir, "off.bin.tmp");
    const rOff = await storeStreamToNas({
      source: bytes(big),
      finalPath: finalOff,
      tmpPath: tmpOff,
      maxBytes: big.length + 10,
      ext: "bin",
      hashMode: "off",
    });
    expect(rOff.msHash).toBe(0);
    expect(typeof rOff.msWrite).toBe("number");
    expect(rOff.msWrite).toBeGreaterThanOrEqual(0);

    const finalDeferred = path.join(dir, "deferred.bin");
    const tmpDeferred = path.join(dir, "deferred.bin.tmp");
    const rDeferred = await storeStreamToNas({
      source: bytes(big),
      finalPath: finalDeferred,
      tmpPath: tmpDeferred,
      maxBytes: big.length + 10,
      ext: "bin",
      hashMode: "deferred",
    });
    expect(rDeferred.msHash).toBeGreaterThan(0);
  });
});

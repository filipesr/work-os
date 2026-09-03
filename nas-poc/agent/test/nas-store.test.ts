import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
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
});

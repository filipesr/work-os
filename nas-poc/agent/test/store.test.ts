import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PersistentJtiStore, FinalizeQueue } from "../src/store";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "agent-store-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("PersistentJtiStore", () => {
  it("dedup de jti e persistência entre instâncias (sobrevive a restart)", () => {
    const file = path.join(dir, "jti.json");
    const s1 = new PersistentJtiStore(file);
    expect(s1.claim("abc")).toBe(true);
    expect(s1.claim("abc")).toBe(false); // replay na mesma instância

    // Nova instância recarrega do disco — o replay continua bloqueado.
    const s2 = new PersistentJtiStore(file);
    expect(s2.claim("abc")).toBe(false);
    expect(s2.claim("def")).toBe(true);
  });

  it("expira jti vencido (sweep)", () => {
    const s = new PersistentJtiStore();
    const past = Math.floor(Date.now() / 1000) - 10;
    s.claim("old", past);
    // Como 'old' já venceu, um novo claim do mesmo jti é permitido após o sweep.
    expect(s.claim("old")).toBe(true);
  });
});

describe("FinalizeQueue", () => {
  it("enfileira, lista vencidos e remove; persiste entre instâncias", async () => {
    const file = path.join(dir, "q.json");
    const q1 = new FinalizeQueue(file);
    await q1.enqueue({ artifactId: "a1", checksum: "cs", sizeBytes: 10 });
    await q1.enqueue({ artifactId: "a2", checksum: null, sizeBytes: 20 });
    expect(q1.pending()).toBe(2);
    expect(
      q1
        .due()
        .map((j) => j.artifactId)
        .sort()
    ).toEqual(["a1", "a2"]);

    await q1.remove("a1");
    expect(q1.pending()).toBe(1);

    // Recarrega do disco.
    const q2 = new FinalizeQueue(file);
    expect(q2.pending()).toBe(1);
    expect(q2.due()[0].artifactId).toBe("a2");
  });

  it("reschedule adia o job (backoff)", async () => {
    const file = path.join(dir, "q2.json");
    const q = new FinalizeQueue(file);
    await q.enqueue({ artifactId: "a1", checksum: null, sizeBytes: 1 });
    const future = Date.now() + 60_000;
    await q.reschedule("a1", 2, future);
    expect(q.due(Date.now()).length).toBe(0); // adiado
    expect(q.due(future + 1)[0].attempts).toBe(2);
  });
});
